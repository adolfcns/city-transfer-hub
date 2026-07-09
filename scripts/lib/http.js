// HTTP 工具：统一代理（本地走 Clash，CI 直连）、超时、重试
import net from 'node:net';
import { request, ProxyAgent, Agent } from 'undici';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const DEFAULT_LOCAL_PROXY = 'http://127.0.0.1:7897';

let dispatcher = null;

function probe(host, port, ms = 500) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (ok) => { s.destroy(); resolve(ok); };
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    setTimeout(() => done(false), ms);
  });
}

export async function initHttp() {
  const explicit = process.env.PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (explicit) {
    dispatcher = new ProxyAgent(explicit);
    console.log(`[http] 使用代理 ${explicit}`);
    return;
  }
  if (!process.env.CI) {
    const u = new URL(DEFAULT_LOCAL_PROXY);
    if (await probe(u.hostname, Number(u.port))) {
      dispatcher = new ProxyAgent(DEFAULT_LOCAL_PROXY);
      console.log(`[http] 检测到本地代理，使用 ${DEFAULT_LOCAL_PROXY}`);
      return;
    }
  }
  dispatcher = new Agent();
  console.log('[http] 直连（无代理）');
}

// 内网地址（如本地 RSSHub）不走代理
const directAgent = new Agent();
function pick(url) {
  const h = new URL(url).hostname;
  return (h === 'localhost' || h === '127.0.0.1') ? directAgent : dispatcher;
}

export async function httpGet(url, { timeout = 20000, retries = 1, headers = {} } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await request(url, {
        dispatcher: pick(url),
        maxRedirections: 5,
        headersTimeout: timeout,
        bodyTimeout: timeout,
        headers: { 'user-agent': UA, accept: '*/*', ...headers },
      });
      const text = await res.body.text();
      if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode}`);
      return text;
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

// 简单并发控制
export async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (i < list.length) {
        const idx = i++;
        out[idx] = await fn(list[idx], idx);
      }
    }),
  );
  return out;
}
