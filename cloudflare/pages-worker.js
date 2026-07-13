// Cloudflare Pages 的全站木鱼接口。
// /prayer 走 D1；其他路径继续交给 Pages 静态资源服务。

const ALLOW_ORIGINS = [
  'https://adolfcns.github.io',
  'https://city-transfer-hub.pages.dev',
  'http://localhost:8787',
];
const PRAYER_ROW_ID = '0000000000001894';
const PRAYER_EMOJI = '💙';
const PRAYER_RATE_SECONDS = 1;
let schemaReady = false;

function responseHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
    'content-type': 'application/json',
    'cache-control': 'no-store',
  };
}

async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS reactions (' +
      'id TEXT NOT NULL, emoji TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, ' +
      'PRIMARY KEY (id, emoji))',
  ).run();
  schemaReady = true;
}

async function readCount(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT n FROM reactions WHERE id = ? AND emoji = ?')
    .bind(PRAYER_ROW_ID, PRAYER_EMOJI).first();
  return Number(row?.n || 0);
}

async function incrementCount(env) {
  await ensureSchema(env);
  await env.DB.prepare(
    'INSERT INTO reactions (id, emoji, n) VALUES (?, ?, 1) ' +
      'ON CONFLICT(id, emoji) DO UPDATE SET n = n + 1',
  ).bind(PRAYER_ROW_ID, PRAYER_EMOJI).run();
  return readCount(env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/prayer') return env.ASSETS.fetch(request);

    const origin = request.headers.get('Origin') || '';
    const headers = responseHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (origin && !ALLOW_ORIGINS.includes(origin)) {
      return new Response(JSON.stringify({ ok: false, reason: 'origin' }), { status: 403, headers });
    }
    if (!env.DB) {
      return new Response(JSON.stringify({ ok: false, reason: 'no_db' }), { status: 503, headers });
    }

    try {
      if (request.method === 'GET') {
        return new Response(JSON.stringify({ ok: true, count: await readCount(env) }), { headers });
      }
      if (request.method === 'POST') {
        const cache = caches.default;
        const ip = request.headers.get('CF-Connecting-IP') || 'anonymous';
        const gate = new Request(`https://prayer-limit.internal/${encodeURIComponent(ip)}`);
        if (await cache.match(gate)) {
          return new Response(JSON.stringify({ ok: false, reason: 'slow_down', count: await readCount(env) }), {
            status: 429,
            headers: { ...headers, 'retry-after': String(PRAYER_RATE_SECONDS) },
          });
        }
        const count = await incrementCount(env);
        await cache.put(gate, new Response('1', {
          headers: { 'cache-control': `max-age=${PRAYER_RATE_SECONDS}` },
        }));
        return new Response(JSON.stringify({ ok: true, count }), { headers });
      }
      return new Response(JSON.stringify({ ok: false, reason: 'method' }), { status: 405, headers });
    } catch {
      return new Response(JSON.stringify({ ok: false, reason: 'db_error' }), { status: 503, headers });
    }
  },
};
