import { AsyncLocalStorage } from 'node:async_hooks';
import { lookup as callbackLookup } from 'node:dns';
import dns from 'node:dns/promises';
import { Agent, Dispatcher, Pool, buildConnector } from 'undici';
import type { Socket } from 'node:net';
import type { LookupAddress } from 'node:dns';
import { hasConfiguredHttpProxy, selectEnvProxy } from './env-proxy';

/** 去掉 URL.hostname 对 IPv6 附加的方括号（"[::1]" → "::1"） */
function stripBrackets(host: string): string {
  return host.trim().replace(/^\[+|\]+$/g, '');
}

/**
 * IPv4-mapped / IPv4-compatible IPv6 还原为点分十进制，命中不到时返回 null。
 * "::ffff:192.168.1.100" 与 "::ffff:c0a8:164" 都会归一化成 "192.168.1.100"，
 * 否则这类地址会绕过下面的私网规则被当成公网放行。
 */
function toIPv4(ip: string): string | null {
  const v = ip.replace(/^0:0:0:0:0:/i, '::'); // 全写形式
  const dotted = /^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(v);
  if (dotted) return dotted[1];
  const hex = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(v);
  if (!hex) return null;
  const n = (((parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16)) >>> 0);
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/** 判断 IP 是否为私有/回环/链路本地/保留地址（SSRF 防护） */
export function isPrivateIP(ip: string): boolean {
  let v = stripBrackets(ip.trim());
  v = toIPv4(v) ?? v;
  if (/^(127\.|0\.0\.0\.0$|::1$|::$|fe80:|fc|fd)/i.test(v)) return true;
  if (v.startsWith('10.')) return true;
  if (v.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;
  if (v.startsWith('169.254.')) return true; // 链路本地（含云元数据 169.254.169.254）
  if (v.startsWith('100.64.')) return true; // CGNAT
  if (v.startsWith('192.0.0.')) return true; // 协议分配块
  return false;
}

const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

/** URL 字面量校验：协议白名单 + 主机名/字面量 IP 黑名单 */
export function isValidProxyUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = stripBrackets(parsed.hostname); // "[::1]" 也要能被黑名单命中
    if (BLOCKED_HOSTNAMES.has(host)) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
      if (isPrivateIP(host)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** DNS 解析后校验目标主机名是否解析到内网/保留地址 */
export async function isBlockedByDNS(urlString: string): Promise<boolean> {
  try {
    const hostname = stripBrackets(new URL(urlString).hostname);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) {
      return isPrivateIP(hostname);
    }
    const result = await dns.lookup(hostname, { all: true });
    return result.some((r) => isPrivateIP(r.address));
  } catch {
    return false; // 解析失败不阻断，交给后续请求处理
  }
}

export type UpstreamVerdict = { ok: true } | { ok: false; reason: string };

/**
 * 出网请求的统一校验入口：字面量校验 + DNS 解析校验。
 *
 * 任何由用户输入驱动的服务端请求（采集站搜索/详情、代理转发）都必须先过这一关，
 * 否则服务器会变成内网探测跳板（/api/search 曾直接用用户传的 source.url 发请求）。
 */
export async function checkUpstreamAllowed(urlString: string): Promise<UpstreamVerdict> {
  if (!isValidProxyUrl(urlString)) {
    return { ok: false, reason: '目标地址不在允许范围内（仅支持公网 http/https）' };
  }
  if (await isBlockedByDNS(urlString)) {
    return { ok: false, reason: '目标地址解析到私有/保留网络' };
  }
  return { ok: true };
}

/** 直播场景是否放行内网地址（自建 IPTV）；由部署者显式开启 */
export function allowLivePrivate(): boolean {
  return process.env.LIVE_ALLOW_PRIVATE === '1';
}

/**
 * 直播地址专用校验：协议必须 http(s)，默认仍拒绝内网，但部署者可用
 * LIVE_ALLOW_PRIVATE=1 显式放行（自建 IPTV 常位于内网）。
 *
 * 与点播侧 checkUpstreamAllowed 的区别只在这一处开关：
 * 订阅/播放列表若沿用点播那把尺子，会静默过滤掉内网自建源。
 */
export async function checkLiveUrlAllowed(urlString: string): Promise<UpstreamVerdict> {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: '直播地址仅支持 http/https 协议' };
    }
  } catch {
    return { ok: false, reason: '无效的直播地址' };
  }
  if (allowLivePrivate()) return { ok: true };
  return checkUpstreamAllowed(urlString);
}


export interface SSRFProtectionContext {
  active: boolean;
  allowPrivate?: boolean;
}

const ssrfStorage = new AsyncLocalStorage<SSRFProtectionContext>();

function ssrfError(message: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code: 'ERR_SSRF_BLOCKED' });
}

function isLiteralAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

/** 连接时解析。任一结果落在私网/保留地址即拒绝，调用方只能连到返回的地址。 */
function lookupAll(hostname: string, allowPrivate: boolean): Promise<LookupAddress[]> {
  const cleanHost = stripBrackets(hostname);
  if (!allowPrivate && BLOCKED_HOSTNAMES.has(cleanHost.toLowerCase())) {
    return Promise.reject(ssrfError(`目标主机名在黑名单中 (${hostname})`));
  }
  if (!allowPrivate && isLiteralAddress(cleanHost) && isPrivateIP(cleanHost)) {
    return Promise.reject(ssrfError(`目标地址属于私有/保留网络 (${cleanHost})`));
  }
  return new Promise((resolve, reject) => {
    callbackLookup(cleanHost, { all: true }, (err, addresses) => {
      if (err) return reject(err);
      const list = Array.isArray(addresses) ? addresses : [];
      if (list.length === 0) return reject(new Error(`未找到主机地址: ${hostname}`));
      if (!allowPrivate) {
        const bad = list.find((item) => isPrivateIP(item.address));
        if (bad) return reject(ssrfError(`目标地址解析到私有/保留网络 (${bad.address})`));
      }
      resolve(list);
    });
  });
}

type ConnectOpts = buildConnector.Options & { protocol?: string; signal?: AbortSignal };

/**
 * 直连连接器。DNS 结果就是真正拨号的地址，因此重绑定无法在检查之后换成另一个 IP。
 */
function makeDirectConnect(allowPrivate: boolean): buildConnector.connector {
  const lookup = (
    hostname: string,
    opts: unknown,
    cb: (err: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void
  ) => {
    lookupAll(hostname, allowPrivate).then(
      (list) => {
        const wantAll = Boolean(opts && typeof opts === 'object' && (opts as { all?: boolean }).all);
        if (wantAll) cb(null, list);
        else cb(null, list[0].address, list[0].family);
      },
      (err: NodeJS.ErrnoException) => cb(err, '')
    );
  };
  const baseConnector = buildConnector({
    lookup: lookup as unknown as (hostname: string, options: import('node:dns').LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => void,
  });
  return (opts, cb) => {
    const cleanHost = stripBrackets(opts.hostname || '');
    if (!allowPrivate) {
      if (BLOCKED_HOSTNAMES.has(cleanHost.toLowerCase())) {
        return cb(ssrfError(`目标主机名在黑名单中 (${cleanHost})`), null);
      }
      if (isLiteralAddress(cleanHost) && isPrivateIP(cleanHost)) {
        return cb(ssrfError(`目标地址属于私有/保留网络 (${cleanHost})`), null);
      }
    }
    return baseConnector(opts, cb);
  };
}

/**
 * 创建受连接级 SSRF / DNS Rebinding 防护的专用 undici Agent。
 *
 * 核心机制（解决 #941）：
 * 1. 独立 Dispatcher：避免复用全局或其他作用域的连接池，杜绝通过已有的 keep-alive socket 绕过连接层校验；
 * 2. 连接前检查：拦截目标为字面量私网 IP 及黑名单主机名（如 127.0.0.1、localhost）；
 * 3. 连接时 DNS 校验：解析域名，只要结果包含任何私网/保留 IP，立即抛出 ERR_SSRF_BLOCKED，
 *    并且随后的 TCP 只能连到这次解析出来的地址，杜绝 DNS Rebinding TOCTOU；
 * 4. 禁用连接保活：使用完毕即释放连接，不留复用窗口。
 */
export function createSSRFAgent(options: { allowPrivate?: boolean } = {}): Agent {
  return new Agent({
    connect: makeDirectConnect(options.allowPrivate === true),
    pipelining: 0,
    keepAliveTimeout: 1,
    keepAliveMaxTimeout: 1,
  });
}

/**
 * 经 HTTP CONNECT 代理出网，同时保住上面的钉死。
 *
 * 约束：隧道的 CONNECT 目标是刚校验过的 IP，不是主机名。代理因此不能自己再解析一次，
 * TLS 的 SNI 仍用原来的主机名。本地 DNS 失败就失败，不会退回「把主机名交给代理解析」，
 * 否则重绑定防护就没了。私网地址在 allowPrivate 时改为直连，不让代理去连内网。
 * 代理本身来自环境变量，视为受信任，连接代理时不做 SSRF 拦截。
 */
function makePinnedProxy(proxyRaw: string, allowPrivate: boolean): { agent: Agent; pool: Pool } {
  const proxyUrl = new URL(proxyRaw);
  const proxyPort = Number(proxyUrl.port) || (proxyUrl.protocol === 'https:' ? 443 : 80);
  const pool = new Pool(proxyUrl.origin, {
    connect: buildConnector({}),
    pipelining: 0,
  });
  const directConnect = makeDirectConnect(allowPrivate);
  const tlsConnect = buildConnector({});
  const auth =
    proxyUrl.username || proxyUrl.password
      ? `Basic ${Buffer.from(`${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`).toString('base64')}`
      : undefined;
  const agent = new Agent({
    connect: (opts, cb) => {
      const target = opts as ConnectOpts;
      void (async () => {
        const hostname = stripBrackets(target.hostname || '');
        const list = await lookupAll(hostname, allowPrivate);
        const pinned = list[0];
        if (isPrivateIP(pinned.address)) {
          directConnect(target, cb);
          return;
        }
        const endpoint = pinned.address.includes(':') ? `[${pinned.address}]` : pinned.address;
        const port = Number(target.port) || (target.protocol === 'https:' ? 443 : 80);
        const authority = `${endpoint}:${port}`;
        const connected = await pool.connect({
          origin: proxyUrl.origin,
          path: authority,
          signal: target.signal,
          headers: { host: authority, ...(auth ? { 'proxy-authorization': auth } : {}) },
          port: proxyPort,
          servername: proxyUrl.hostname,
        } as Dispatcher.ConnectOptions);
        const tunnel = connected.socket as Socket;
        if (connected.statusCode !== 200) {
          tunnel.on('error', () => {}).destroy();
          cb(new Error(`代理隧道失败 (${connected.statusCode})`), null);
          return;
        }
        if (target.protocol !== 'https:') {
          cb(null, tunnel);
          return;
        }
        tlsConnect(
          { ...target, servername: target.servername || hostname, httpSocket: tunnel },
          cb
        );
      })().catch((err: Error) => cb(err, null));
    },
    pipelining: 0,
    keepAliveTimeout: 1,
    keepAliveMaxTimeout: 1,
  });
  return { agent, pool };
}

/** 有 HTTP(S)_PROXY 时按目标选择隧道；否则与原来的直连 Agent 相同。 */
function createProtectedDispatcher(allowPrivate: boolean): Dispatcher {
  if (!hasConfiguredHttpProxy()) return createSSRFAgent({ allowPrivate });
  const direct = createSSRFAgent({ allowPrivate });
  const tunnels = new Map<string, { agent: Agent; pool: Pool }>();
  const shutdown = async (destroy: boolean, err?: Error | null) => {
    const jobs: Array<Promise<void>> = [destroy ? direct.destroy(err ?? null) : direct.close()];
    for (const tunnel of tunnels.values()) {
      jobs.push(destroy ? tunnel.agent.destroy(err ?? null) : tunnel.agent.close());
      jobs.push(destroy ? tunnel.pool.destroy(err ?? null) : tunnel.pool.close());
    }
    await Promise.all(jobs);
  };
  return {
    dispatch(opts, handler) {
      const origin = opts.origin == null ? '' : String(opts.origin);
      const proxy = origin ? selectEnvProxy(origin) : null;
      if (!proxy) return direct.dispatch(opts, handler);
      let tunnel = tunnels.get(proxy);
      if (!tunnel) {
        tunnel = makePinnedProxy(proxy, allowPrivate);
        tunnels.set(proxy, tunnel);
      }
      return tunnel.agent.dispatch(opts, handler);
    },
    close: () => shutdown(false),
    destroy: (err?: Error | null) => shutdown(true, err ?? null),
  } as Dispatcher;
}

const GLOBAL_FETCH_WRAPPED = Symbol.for('libretv.ssrf.fetch.wrapped');

/**
 * 安装安全的 fetch SSRF 防护包装器。
 * 仅在 runWithSSRFProtection 激活的作用域内生效，自动注入安全专用的 Agent，
 * 不影响外部全局网络通信，杜绝 monkey-patch net.Socket.prototype 造成的全局副作用。
 */
export function installFetchSSRFProtection(): void {
  const g = globalThis as unknown as Record<symbol, boolean>;
  if (g[GLOBAL_FETCH_WRAPPED]) return;
  g[GLOBAL_FETCH_WRAPPED] = true;

  const originalFetch = globalThis.fetch;

  globalThis.fetch = async function ssrfProtectedFetch(
    input: RequestInfo | URL,
    init?: RequestInit & { dispatcher?: unknown }
  ): Promise<Response> {
    const ctx = ssrfStorage.getStore();
    if (!ctx || !ctx.active) {
      return originalFetch(input, init);
    }

    // 有 HTTP(S)_PROXY 时走钉死 IP 的 CONNECT 隧道；没有则与原来一样直连。
    // 自定义 dispatcher 会盖住 Node --use-env-proxy 的全局代理，所以这里自己读环境变量。
    const agent = createProtectedDispatcher(ctx.allowPrivate === true);
    try {
      const res = await originalFetch(input, {
        ...init,
        dispatcher: agent,
      } as RequestInit);
      // 收到响应后优雅计划关闭 Agent，避免连接池跨请求保留
      agent.close().catch(() => {});
      return res;
    } catch (err) {
      agent.destroy().catch(() => {});
      throw err;
    }
  };
}

// 兼容别名
export const installConnectionSSRFProtection = installFetchSSRFProtection;

// 模块加载时自动安装防护
installFetchSSRFProtection();

/**
 * 在受连接级 SSRF / DNS Rebinding 防护的作用域中执行异步请求
 */
export function runWithSSRFProtection<T>(
  options: { allowPrivate?: boolean } = {},
  fn: () => Promise<T>
): Promise<T> {
  return ssrfStorage.run({ active: true, allowPrivate: options.allowPrivate }, fn);
}
