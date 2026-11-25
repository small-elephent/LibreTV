import http from 'node:http';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { POST as login } from '@/app/api/auth/route';
import { GET as detail } from '@/app/api/detail/route';
import { GET as playlist } from '@/app/api/live/playlist/route';
import { GET as mediaProxy } from '@/app/api/proxy/route';
import { POST as search } from '@/app/api/search/route';

/**
 * 路由级代理回归：不替换 global fetch。
 * 诊断代理只计数并在隧道里回夹具，不向真实站点转发。
 */

vi.hoisted(() => {
  process.env.SEARCH_SOURCE_TIMEOUT_MS = '3000';
});

const dnsHosts = vi.hoisted(() => ({
  records: new Map<string, string[]>(),
}));

function remember(hostname: string, ips: string[]): void {
  dnsHosts.records.set(hostname.replace(/^\[|\]$/g, '').toLowerCase(), ips);
}

function mockedAddresses(hostname: string): Array<{ address: string; family: number }> | null {
  const ips = dnsHosts.records.get(hostname.replace(/^\[|\]$/g, '').toLowerCase());
  if (!ips) return null;
  return ips.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
}

vi.mock('node:dns', async () => {
  const actual = await vi.importActual<typeof import('node:dns')>('node:dns');
  return {
    ...actual,
    lookup(
      hostname: string,
      options: unknown,
      callback?: (err: NodeJS.ErrnoException | null, address: string | Array<{ address: string; family: number }>, family?: number) => void
    ) {
      let opts = options;
      let cb = callback;
      if (typeof options === 'function') {
        cb = options as typeof callback;
        opts = {};
      }
      const custom = mockedAddresses(String(hostname));
      if (!custom || !cb) {
        return actual.lookup(hostname, opts as never, cb as never);
      }
      const all = Boolean(opts && typeof opts === 'object' && (opts as { all?: boolean }).all);
      if (all) cb(null, custom);
      else cb(null, custom[0].address, custom[0].family);
    },
  };
});

vi.mock('node:dns/promises', async () => {
  const actual = await vi.importActual<typeof import('node:dns/promises')>('node:dns/promises');
  return {
    ...actual,
    async lookup(hostname: string, options?: unknown) {
      const custom = mockedAddresses(String(hostname));
      if (!custom) return actual.lookup(hostname, options as never);
      const all = Boolean(options && typeof options === 'object' && (options as { all?: boolean }).all);
      if (all) return custom;
      return { address: custom[0].address, family: custom[0].family };
    },
  };
});

const ENV_KEYS = [
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'LIVE_ALLOW_PRIVATE',
  'PASSWORD',
] as const;

const saved: Record<string, string | undefined> = {};
const PASSWORD = `ephemeral-${Math.random().toString(16).slice(2)}`;

type ProxyMode = 'cms' | 'detail' | 'media' | 'm3u' | 'redirect';

function bodyFor(mode: ProxyMode, head: string): { status: number; headers: string; body: string } {
  if (mode === 'redirect') {
    return {
      status: 302,
      headers: 'Location: http://evil.example.test/secret',
      body: '',
    };
  }
  if (mode === 'detail') {
    const body = JSON.stringify({
      list: [{ vod_id: '1', vod_name: '后会友期', vod_play_url: '第1集$http://cdn.example.test/1.m3u8' }],
    });
    return { status: 200, headers: 'Content-Type: application/json', body };
  }
  if (mode === 'media') {
    return { status: 200, headers: 'Content-Type: image/jpeg', body: 'fixture-image' };
  }
  if (mode === 'm3u') {
    const body = '#EXTM3U\n#EXTINF:-1 group-title="测试",夹具频道\nhttp://cdn.example.test/live.ts\n';
    return { status: 200, headers: 'Content-Type: application/vnd.apple.mpegurl', body };
  }
  const body = JSON.stringify({
    code: 1,
    pagecount: 1,
    list: [{ vod_id: 1, vod_name: '后会友期', type_name: '国产剧' }],
  });
  void head;
  return { status: 200, headers: 'Content-Type: application/json', body };
}

function startProxy(mode: ProxyMode): Promise<{ port: number; connects: string[]; close: () => Promise<void> }> {
  const connects: string[] = [];
  const server = http.createServer();
  server.on('connect', (req, socket) => {
    connects.push(`CONNECT ${req.url}`);
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    const chunks: Buffer[] = [];
    const onData = (buf: Buffer) => {
      chunks.push(buf);
      const raw = Buffer.concat(chunks).toString('latin1');
      if (!raw.includes('\r\n\r\n')) return;
      socket.off('data', onData);
      const payload = bodyFor(mode, raw);
      const bytes = Buffer.byteLength(payload.body);
      socket.end(
        `HTTP/1.1 ${payload.status} ${payload.status === 302 ? 'Found' : 'OK'}\r\n${payload.headers}\r\nContent-Length: ${bytes}\r\nConnection: close\r\n\r\n${payload.body}`
      );
    };
    socket.on('data', onData);
    socket.on('error', () => {});
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('代理没有端口');
      resolve({
        port: addr.port,
        connects,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

function startDirect(body: string, contentType: string): Promise<{ url: string; hits: number; close: () => Promise<void> }> {
  let hits = 0;
  const server = http.createServer((_req, res) => {
    hits += 1;
    res.writeHead(200, { 'content-type': contentType });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('直连夹具没有端口');
      resolve({
        get hits() {
          return hits;
        },
        url: `http://127.0.0.1:${addr.port}/list.m3u`,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
let direct: Awaited<ReturnType<typeof startDirect>> | undefined;

async function cookie(): Promise<string> {
  const res = await login(
    new Request('http://127.0.0.1/api/auth', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': `10.9.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
      },
      body: JSON.stringify({ password: PASSWORD }),
    })
  );
  expect(res.status).toBe(200);
  const setCookie = res.headers.get('set-cookie') ?? '';
  const pair = setCookie.split(';')[0];
  expect(pair.startsWith('ltv_session=')).toBe(true);
  return pair;
}

beforeAll(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.PASSWORD = PASSWORD;
});

afterEach(async () => {
  if (proxy) await proxy.close();
  if (direct) await direct.close();
  proxy = undefined;
  direct = undefined;
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  process.env.PASSWORD = PASSWORD;
});

describe('已配置的 HTTP 代理必须被上游路由使用', () => {
  it('登录后的搜索经代理隧道拿到夹具结果，且 CONNECT 目标是校验过的 IP', async () => {
    remember('cms.example.test', ['203.0.113.10']);
    proxy = await startProxy('cms');
    process.env.HTTP_PROXY = `http://127.0.0.1:${proxy.port}`;
    process.env.HTTPS_PROXY = process.env.HTTP_PROXY;
    const session = await cookie();
    const res = await search(
      new Request('http://127.0.0.1/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: session },
        body: JSON.stringify({
          wd: '后会友期',
          sources: [{ key: 's', name: '夹具', url: `http://cms.example.test/api-${Date.now()}.php` }],
        }),
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { list: Array<{ name: string }>; failures: unknown[] };
    expect(data.failures).toEqual([]);
    expect(data.list.map((item) => item.name)).toContain('后会友期');
    expect(proxy.connects.some((line) => line.startsWith('CONNECT 203.0.113.10:'))).toBe(true);
  });

  it('NO_PROXY 命中时不走代理', async () => {
    remember('cms.example.test', ['203.0.113.10']);
    proxy = await startProxy('cms');
    process.env.HTTP_PROXY = `http://127.0.0.1:${proxy.port}`;
    process.env.HTTPS_PROXY = process.env.HTTP_PROXY;
    process.env.NO_PROXY = 'cms.example.test';
    const session = await cookie();
    const res = await search(
      new Request('http://127.0.0.1/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: session },
        body: JSON.stringify({
          wd: '后会友期',
          sources: [{ key: 's', name: '夹具', url: `http://cms.example.test/direct-${Date.now()}.php` }],
        }),
      })
    );
    const data = (await res.json()) as { list: Array<{ name: string }>; failures: unknown[] };
    expect(proxy.connects).toEqual([]);
    expect(data.list).toEqual([]);
    expect(data.failures.length).toBeGreaterThan(0);
  }, 12_000);

  it('没有代理环境变量时，内网直播列表直接成功且不碰代理', async () => {
    const m3u = '#EXTM3U\n#EXTINF:-1 group-title="测试",直连频道\nhttp://cdn.example.test/live.ts\n';
    direct = await startDirect(m3u, 'application/vnd.apple.mpegurl');
    proxy = await startProxy('m3u');
    process.env.LIVE_ALLOW_PRIVATE = '1';
    const session = await cookie();
    const res = await playlist(
      new Request(`http://127.0.0.1/api/live/playlist?force=1&url=${encodeURIComponent(direct.url)}`, {
        headers: { cookie: session },
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { channels: Array<{ name: string }> };
    expect(data.channels.map((c) => c.name)).toContain('直连频道');
    expect(proxy.connects).toEqual([]);
    expect(direct.hits).toBeGreaterThan(0);
  });

  it('字面量私网和解析到元数据地址的主机名都不会打到代理', async () => {
    remember('evil.example.test', ['169.254.169.254']);
    proxy = await startProxy('cms');
    process.env.HTTP_PROXY = `http://127.0.0.1:${proxy.port}`;
    process.env.HTTPS_PROXY = process.env.HTTP_PROXY;
    const session = await cookie();
    const literal = await search(
      new Request('http://127.0.0.1/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: session },
        body: JSON.stringify({
          wd: '后会友期',
          sources: [{ key: 'p', name: '私网', url: 'http://169.254.169.254/latest/meta-data' }],
        }),
      })
    );
    const spoofed = await search(
      new Request('http://127.0.0.1/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: session },
        body: JSON.stringify({
          wd: '后会友期',
          sources: [{ key: 'e', name: '恶', url: `http://evil.example.test/api-${Date.now()}.php` }],
        }),
      })
    );
    expect((await literal.json()).failures).toHaveLength(1);
    expect((await spoofed.json()).failures).toHaveLength(1);
    expect(proxy.connects).toEqual([]);
  });

  it('代理返回跳转到私网 DNS 的地址时，第二跳被拒绝且不会 CONNECT 到那个地址', async () => {
    remember('cms.example.test', ['203.0.113.10']);
    remember('evil.example.test', ['10.1.2.3']);
    proxy = await startProxy('redirect');
    process.env.HTTP_PROXY = `http://127.0.0.1:${proxy.port}`;
    process.env.HTTPS_PROXY = process.env.HTTP_PROXY;
    const session = await cookie();
    const res = await search(
      new Request('http://127.0.0.1/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: session },
        body: JSON.stringify({
          wd: '后会友期',
          sources: [{ key: 'r', name: '跳', url: `http://cms.example.test/redir-${Date.now()}.php` }],
        }),
      })
    );
    const data = (await res.json()) as { list: unknown[]; failures: Array<{ error: string }> };
    expect(data.list).toEqual([]);
    expect(data.failures[0]?.error).toMatch(/拒绝|私有|保留/);
    expect(proxy.connects.some((line) => line.includes('10.1.2.3') || line.includes('evil.example.test'))).toBe(false);
    expect(proxy.connects.some((line) => line.startsWith('CONNECT 203.0.113.10:'))).toBe(true);
  });

  it('详情和媒体代理同样走已配置的代理', async () => {
    remember('cms.example.test', ['203.0.113.10']);
    proxy = await startProxy('detail');
    process.env.HTTP_PROXY = `http://127.0.0.1:${proxy.port}`;
    process.env.HTTPS_PROXY = process.env.HTTP_PROXY;
    const session = await cookie();
    const sourceUrl = `http://cms.example.test/detail-${Date.now()}.php`;
    const detailRes = await detail(
      new Request(
        `http://127.0.0.1/api/detail?id=1&source=${encodeURIComponent(JSON.stringify({ key: 's', name: '夹具', url: sourceUrl }))}`,
        { headers: { cookie: session } }
      )
    );
    expect(detailRes.status).toBe(200);
    const detailBody = (await detailRes.json()) as { videoInfo?: { title?: string }; episodes?: string[] };
    expect(detailBody.videoInfo?.title).toBe('后会友期');
    expect(detailBody.episodes?.[0]).toContain('.m3u8');

    await proxy.close();
    proxy = await startProxy('media');
    process.env.HTTP_PROXY = `http://127.0.0.1:${proxy.port}`;
    process.env.HTTPS_PROXY = process.env.HTTP_PROXY;
    const mediaRes = await mediaProxy(
      new Request(`http://127.0.0.1/api/proxy?url=${encodeURIComponent(`http://cms.example.test/poster-${Date.now()}.jpg`)}`, {
        headers: { cookie: session },
      })
    );
    expect(mediaRes.status).toBe(200);
    expect(await mediaRes.text()).toBe('fixture-image');
    expect(proxy.connects.some((line) => line.startsWith('CONNECT 203.0.113.10:'))).toBe(true);
  });

  it('直播列表的公网地址走代理，放行的内网地址仍直连', async () => {
    remember('cms.example.test', ['203.0.113.10']);
    const m3u = '#EXTM3U\n#EXTINF:-1 group-title="测试",直连频道\nhttp://cdn.example.test/live.ts\n';
    direct = await startDirect(m3u, 'application/vnd.apple.mpegurl');
    proxy = await startProxy('m3u');
    process.env.HTTP_PROXY = `http://127.0.0.1:${proxy.port}`;
    process.env.HTTPS_PROXY = process.env.HTTP_PROXY;
    process.env.LIVE_ALLOW_PRIVATE = '1';
    const session = await cookie();
    const local = await playlist(
      new Request(`http://127.0.0.1/api/live/playlist?force=1&url=${encodeURIComponent(direct.url)}`, {
        headers: { cookie: session },
      })
    );
    expect(local.status).toBe(200);
    expect(proxy.connects).toEqual([]);
    expect(direct.hits).toBeGreaterThan(0);

    const remote = await playlist(
      new Request(
        `http://127.0.0.1/api/live/playlist?force=1&url=${encodeURIComponent(`http://cms.example.test/list-${Date.now()}.m3u`)}`,
        { headers: { cookie: session } }
      )
    );
    expect(remote.status).toBe(200);
    const remoteBody = (await remote.json()) as { channels: Array<{ name: string }> };
    expect(remoteBody.channels.map((c) => c.name)).toContain('夹具频道');
    expect(proxy.connects.some((line) => line.startsWith('CONNECT 203.0.113.10:'))).toBe(true);
  });
});
