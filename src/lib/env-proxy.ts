/**
 * 选择上游请求要用的 HTTP 代理。
 *
 * 规则与 undici EnvHttpProxyAgent（Node `--use-env-proxy`）一致：
 * - http 目标只用 HTTP_PROXY / http_proxy；
 * - https 目标用 HTTPS_PROXY / https_proxy，没有则回落到 HTTP_PROXY；
 * - NO_PROXY / no_proxy 命中则直接连接；
 * - 只接受 http:// 与 https://。SOCKS 不能安全地套进现有的 CONNECT + DNS 钉死，故视为未配置。
 * 代理地址来自部署者环境，视为受信任，不把它当作 SSRF 目标。
 */

const DEFAULT_PORTS: Record<string, number> = { 'http:': 80, 'https:': 443 };

export function hasConfiguredHttpProxy(env: Record<string, string | undefined> = process.env): boolean {
  return parseHttpProxy(env.http_proxy ?? env.HTTP_PROXY) != null || parseHttpProxy(env.https_proxy ?? env.HTTPS_PROXY) != null;
}

/** 返回应使用的代理 URL；直接连接时返回 null。target 是源站地址或 origin。 */
export function selectEnvProxy(target: string, env: Record<string, string | undefined> = process.env): string | null {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!shouldProxy(url, env.no_proxy ?? env.NO_PROXY ?? '')) return null;
  const httpProxy = parseHttpProxy(env.http_proxy ?? env.HTTP_PROXY);
  const httpsProxy = parseHttpProxy(env.https_proxy ?? env.HTTPS_PROXY);
  if (url.protocol === 'https:') return httpsProxy ?? httpProxy;
  return httpProxy;
}

function parseHttpProxy(raw: string | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return trimmed;
  } catch {
    return null;
  }
}

function shouldProxy(url: URL, noProxy: string): boolean {
  if (noProxy === '*') return false;
  const { hostname, port } = hostAndPort(url);
  for (const entry of parseNoProxy(noProxy)) {
    if (entry.port && entry.port !== port) continue;
    if (!/^[.*]/.test(entry.hostname)) {
      if (hostname === entry.hostname) return false;
    } else if (hostname.endsWith(entry.hostname.replace(/^\*/, ''))) {
      return false;
    }
  }
  return true;
}

function hostAndPort(url: URL): { hostname: string; port: number } {
  // 与 EnvHttpProxyAgent 相同：用 host 去掉端口，IPv6 保留方括号。
  const hostname = url.host.toLowerCase().replace(/:\d*$/, '');
  const port = Number.parseInt(url.port, 10) || DEFAULT_PORTS[url.protocol] || 0;
  return { hostname, port };
}

function parseNoProxy(noProxy: string): Array<{ hostname: string; port: number }> {
  const entries: Array<{ hostname: string; port: number }> = [];
  for (const part of noProxy.split(/[,\s]/)) {
    if (!part) continue;
    const parsed = /^(.+):(\d+)$/.exec(part);
    entries.push({
      hostname: (parsed ? parsed[1] : part).toLowerCase(),
      port: parsed ? Number.parseInt(parsed[2], 10) : 0,
    });
  }
  return entries;
}
