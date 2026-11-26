import { describe, expect, it } from 'vitest';
import { selectEnvProxy } from './env-proxy';

const HTTP = 'http://127.0.0.1:7897';
const HTTPS = 'http://127.0.0.1:7898';

describe('selectEnvProxy', () => {
  it('没有代理环境变量时直接连接', () => {
    expect(selectEnvProxy('http://cms.example.test/api.php', {})).toBeNull();
  });

  it('http 目标只用 HTTP_PROXY，https 目标在缺少 HTTPS_PROXY 时回落到 HTTP_PROXY', () => {
    const env = { HTTP_PROXY: HTTP };
    expect(selectEnvProxy('http://cms.example.test/a', env)).toBe(HTTP);
    expect(selectEnvProxy('https://cms.example.test/a', env)).toBe(HTTP);
  });

  it('https 目标优先 HTTPS_PROXY，http 目标不借用 HTTPS_PROXY', () => {
    const env = { HTTP_PROXY: HTTP, HTTPS_PROXY: HTTPS };
    expect(selectEnvProxy('https://cms.example.test/a', env)).toBe(HTTPS);
    expect(selectEnvProxy('http://cms.example.test/a', env)).toBe(HTTP);
    expect(selectEnvProxy('http://cms.example.test/a', { HTTPS_PROXY: HTTPS })).toBeNull();
  });

  it('小写变量与 Node --use-env-proxy 一样可读，空字符串不回落到大写', () => {
    expect(selectEnvProxy('http://cms.example.test/a', { http_proxy: HTTP, HTTP_PROXY: HTTPS })).toBe(HTTP);
    expect(selectEnvProxy('http://cms.example.test/a', { http_proxy: '', HTTP_PROXY: HTTP })).toBeNull();
  });

  it('SOCKS 和其他协议不当成可用代理', () => {
    expect(selectEnvProxy('http://cms.example.test/a', { HTTP_PROXY: 'socks5://127.0.0.1:7897' })).toBeNull();
    expect(selectEnvProxy('http://cms.example.test/a', { HTTP_PROXY: 'not a url' })).toBeNull();
  });

  it('NO_PROXY 精确匹配、后缀、端口和 * 都跳过代理', () => {
    const env = { HTTP_PROXY: HTTP, NO_PROXY: 'cms.example.test, .other.test, skip.test:81' };
    expect(selectEnvProxy('http://cms.example.test/a', env)).toBeNull();
    expect(selectEnvProxy('http://CMS.Example.Test/a', env)).toBeNull();
    expect(selectEnvProxy('http://a.other.test/a', env)).toBeNull();
    expect(selectEnvProxy('http://skip.test:81/a', env)).toBeNull();
    expect(selectEnvProxy('http://skip.test/a', env)).toBe(HTTP);
    expect(selectEnvProxy('http://else.test/a', env)).toBe(HTTP);
    expect(selectEnvProxy('http://cms.example.test/a', { HTTP_PROXY: HTTP, NO_PROXY: '*' })).toBeNull();
  });
});
