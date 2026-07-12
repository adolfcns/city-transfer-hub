// 触发代理 + 定时器（Cloudflare Worker）
// 作用一：网页访客点 ⚡ → 请求本 Worker → Worker 用藏在服务端的令牌触发 GitHub 抓取。
// 作用二：Cloudflare 定时器（Cron Trigger）每 30 分钟自动触发一次抓取，不依赖 GitHub 自己的定时器。
// 令牌永不暴露给访客。
//
// 部署步骤（免费）：
//   1. 把本文件全部内容粘进 Worker 代码区 → Deploy
//   2. Worker → Settings → Variables and Secrets → Add：
//        Type: Secret   Name: GH_PAT   Value: （fine-grained 令牌，只授本仓库 Actions 读写）
//   3. Worker → Settings → Triggers（或 Trigger Events）→ Cron Triggers → Add Cron Trigger
//        填： */30 * * * *   （每 30 分钟）→ Add / Deploy
//   4. 把 Worker 地址填进 static/app.js 的 TRIGGER_ENDPOINT（已填）

const REPO = 'adolfcns/city-transfer-hub';
const WORKFLOW = 'fetch.yml';
// 允许调用的站点（主站 + Cloudflare Pages 镜像）
const ALLOW_ORIGINS = [
  'https://adolfcns.github.io',
  'https://city-transfer-hub.pages.dev',
  'http://localhost:8787', // 本地调试
];
const COOLDOWN_SECONDS = 90;                        // 访客触发的全局冷却，防止被刷

// 用服务端令牌触发 GitHub 抓取任务
async function triggerGitHub(env) {
  return fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GH_PAT}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'city-transfer-hub-trigger', // GitHub API 必需
    },
    body: JSON.stringify({ ref: 'main' }),
  });
}

// 表情白名单（与前端一致）
const EMOJIS = ['🔥', '💙', '👀', '😂', '🤨'];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Vary': 'Origin',
      'content-type': 'application/json',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const path = new URL(request.url).pathname;

    // —— 表情计数：GET /reactions 全量读取 ——
    if (path === '/reactions' && request.method === 'GET') {
      if (!env.DB) return new Response('{}', { headers: cors });
      const { results } = await env.DB.prepare('SELECT id, emoji, n FROM reactions WHERE n > 0').all();
      const map = {};
      for (const r of results) (map[r.id] ||= {})[r.emoji] = r.n;
      return new Response(JSON.stringify(map), { headers: cors });
    }

    // —— 表情计数：POST /react {id, emoji, op} 点/取消 ——
    if (path === '/react' && request.method === 'POST') {
      if (!env.DB) return new Response(JSON.stringify({ ok: false, reason: 'no db' }), { status: 503, headers: cors });
      let body;
      try { body = await request.json(); } catch { body = null; }
      const id = String(body?.id || '');
      const emoji = String(body?.emoji || '');
      const delta = body?.op === '-1' ? -1 : 1;
      if (!/^[0-9a-f]{16}$/.test(id) || !EMOJIS.includes(emoji)) {
        return new Response(JSON.stringify({ ok: false, reason: 'bad input' }), { status: 400, headers: cors });
      }
      await env.DB.prepare(
        'INSERT INTO reactions (id, emoji, n) VALUES (?, ?, MAX(0, ?)) ' +
        'ON CONFLICT(id, emoji) DO UPDATE SET n = MAX(0, n + ?)',
      ).bind(id, emoji, delta, delta).run();
      const row = await env.DB.prepare('SELECT n FROM reactions WHERE id = ? AND emoji = ?').bind(id, emoji).first();
      return new Response(JSON.stringify({ ok: true, n: row?.n ?? 0 }), { headers: cors });
    }

    // —— 访客点 ⚡ 触发抓取（POST /）——
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, reason: 'use POST' }), { status: 405, headers: cors });
    }

    const cache = caches.default;
    const gate = new Request('https://cooldown.internal/last');
    if (await cache.match(gate)) {
      return new Response(JSON.stringify({ ok: false, reason: 'cooldown' }), { status: 429, headers: cors });
    }

    const res = await triggerGitHub(env);
    if (res.status === 204) {
      await cache.put(gate, new Response('1', { headers: { 'cache-control': `max-age=${COOLDOWN_SECONDS}` } }));
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }
    return new Response(JSON.stringify({ ok: false, status: res.status }), { status: 502, headers: cors });
  },

  // —— Cloudflare 定时器（Cron Trigger）每 30 分钟自动走这里 ——
  async scheduled(event, env, ctx) {
    ctx.waitUntil(triggerGitHub(env));
  },
};
