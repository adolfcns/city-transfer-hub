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
const PRAYER_ROW_ID = '0000000000001894';           // 专用行，1894 对应俱乐部成立年份
const PRAYER_EMOJI = '💙';
const PRAYER_RATE_SECONDS = 1;
const REACTION_KEYS = ['fire', 'heart', 'watch', 'wild', 'doubt'];
const ITEM_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const VOTER_ID_RE = /^[A-Za-z0-9_-]{12,80}$/;
const MAX_REACTION_IDS = 48;
let schemaReady = false;

async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS reactions (' +
        'id TEXT NOT NULL, emoji TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, ' +
        'PRIMARY KEY (id, emoji))',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS reaction_votes (' +
        'item_id TEXT NOT NULL, voter_id TEXT NOT NULL, reaction TEXT NOT NULL, updated_at INTEGER NOT NULL, ' +
        'PRIMARY KEY (item_id, voter_id))',
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_reaction_votes_item ON reaction_votes(item_id)'),
  ]);
  schemaReady = true;
}

async function readPrayerCount(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT n FROM reactions WHERE id = ? AND emoji = ?')
    .bind(PRAYER_ROW_ID, PRAYER_EMOJI).first();
  return Number(row?.n || 0);
}

async function incrementPrayerCount(env) {
  await ensureSchema(env);
  await env.DB.prepare(
    'INSERT INTO reactions (id, emoji, n) VALUES (?, ?, 1) ' +
    'ON CONFLICT(id, emoji) DO UPDATE SET n = n + 1',
  ).bind(PRAYER_ROW_ID, PRAYER_EMOJI).run();
  return readPrayerCount(env);
}

function blankReactionCounts() {
  return Object.fromEntries(REACTION_KEYS.map((key) => [key, 0]));
}

async function readReactionCounts(env, ids = null) {
  await ensureSchema(env);
  const args = [...REACTION_KEYS];
  let where = `emoji IN (${REACTION_KEYS.map(() => '?').join(',')})`;
  if (ids?.length) {
    where += ` AND id IN (${ids.map(() => '?').join(',')})`;
    args.push(...ids);
  } else {
    where += ' AND id <> ?';
    args.push(PRAYER_ROW_ID);
  }
  const result = await env.DB.prepare(`SELECT id, emoji, n FROM reactions WHERE ${where}`).bind(...args).all();
  const counts = {};
  for (const row of result.results || []) {
    if (!REACTION_KEYS.includes(row.emoji) || !ITEM_ID_RE.test(row.id)) continue;
    counts[row.id] ||= blankReactionCounts();
    counts[row.id][row.emoji] = Math.max(0, Number(row.n || 0));
  }
  if (ids?.length) for (const id of ids) counts[id] ||= blankReactionCounts();
  return counts;
}

async function recordReaction(env, itemId, voterId, reaction) {
  await ensureSchema(env);
  const previous = await env.DB.prepare(
    'SELECT reaction FROM reaction_votes WHERE item_id = ? AND voter_id = ?',
  ).bind(itemId, voterId).first();
  if (previous?.reaction === reaction) return readReactionCounts(env, [itemId]);

  const statements = [];
  if (REACTION_KEYS.includes(previous?.reaction)) {
    statements.push(env.DB.prepare(
      'UPDATE reactions SET n = MAX(n - 1, 0) WHERE id = ? AND emoji = ?',
    ).bind(itemId, previous.reaction));
  }
  statements.push(
    env.DB.prepare(
      'INSERT INTO reactions (id, emoji, n) VALUES (?, ?, 1) ' +
        'ON CONFLICT(id, emoji) DO UPDATE SET n = n + 1',
    ).bind(itemId, reaction),
    env.DB.prepare(
      'INSERT INTO reaction_votes (item_id, voter_id, reaction, updated_at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(item_id, voter_id) DO UPDATE SET reaction = excluded.reaction, updated_at = excluded.updated_at',
    ).bind(itemId, voterId, reaction, Date.now()),
  );
  await env.DB.batch(statements);
  return readReactionCounts(env, [itemId]);
}

function parseReactionIds(url) {
  const raw = url.searchParams.get('ids');
  if (!raw) return [];
  const ids = [...new Set(raw.split(',').map((id) => id.trim()).filter(Boolean))];
  if (ids.length > MAX_REACTION_IDS || ids.some((id) => !ITEM_ID_RE.test(id))) return null;
  return ids;
}

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

export default {
  // —— 访客点 ⚡ 时走这里 ——
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const originAllowed = !origin || ALLOW_ORIGINS.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Vary': 'Origin',
      'content-type': 'application/json',
      'cache-control': 'no-store',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const path = new URL(request.url).pathname;

    // —— 全站木鱼：GET 读取总数，POST 原子 +1 ——
    if (path === '/prayer') {
      if (!originAllowed) {
        return new Response(JSON.stringify({ ok: false, reason: 'origin' }), { status: 403, headers: cors });
      }
      if (!env.DB) {
        return new Response(JSON.stringify({ ok: false, reason: 'no_db' }), { status: 503, headers: cors });
      }
      try {
        if (request.method === 'GET') {
          return new Response(JSON.stringify({ ok: true, count: await readPrayerCount(env) }), { headers: cors });
        }
        if (request.method === 'POST') {
          const cache = caches.default;
          const ip = request.headers.get('CF-Connecting-IP') || 'anonymous';
          const gate = new Request(`https://prayer-limit.internal/${encodeURIComponent(ip)}`);
          if (await cache.match(gate)) {
            return new Response(JSON.stringify({ ok: false, reason: 'slow_down', count: await readPrayerCount(env) }), {
              status: 429, headers: { ...cors, 'retry-after': String(PRAYER_RATE_SECONDS) },
            });
          }
          const count = await incrementPrayerCount(env);
          await cache.put(gate, new Response('1', { headers: { 'cache-control': `max-age=${PRAYER_RATE_SECONDS}` } }));
          return new Response(JSON.stringify({ ok: true, count }), { headers: cors });
        }
        return new Response(JSON.stringify({ ok: false, reason: 'method' }), { status: 405, headers: cors });
      } catch {
        return new Response(JSON.stringify({ ok: false, reason: 'db_error' }), { status: 503, headers: cors });
      }
    }

    // —— 每条消息的五种表情：批量读取；同一匿名设备每条消息保留一个选择 ——
    if (path === '/reactions') {
      if (!originAllowed) {
        return new Response(JSON.stringify({ ok: false, reason: 'origin' }), { status: 403, headers: cors });
      }
      if (!env.DB) {
        return new Response(JSON.stringify({ ok: false, reason: 'no_db' }), { status: 503, headers: cors });
      }
      try {
        const url = new URL(request.url);
        if (request.method === 'GET') {
          const ids = parseReactionIds(url);
          if (ids === null) {
            return new Response(JSON.stringify({ ok: false, reason: 'bad_ids' }), { status: 400, headers: cors });
          }
          const counts = await readReactionCounts(env, ids.length ? ids : null);
          return new Response(JSON.stringify({ ok: true, counts }), { headers: cors });
        }
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const itemId = String(body.id || '');
          const voterId = String(body.voter || '');
          const reaction = String(body.reaction || '');
          if (!ITEM_ID_RE.test(itemId) || !VOTER_ID_RE.test(voterId) || !REACTION_KEYS.includes(reaction)) {
            return new Response(JSON.stringify({ ok: false, reason: 'bad_request' }), { status: 400, headers: cors });
          }
          const counts = await recordReaction(env, itemId, voterId, reaction);
          return new Response(JSON.stringify({ ok: true, counts, selected: reaction }), { headers: cors });
        }
        return new Response(JSON.stringify({ ok: false, reason: 'method' }), { status: 405, headers: cors });
      } catch {
        return new Response(JSON.stringify({ ok: false, reason: 'db_error' }), { status: 503, headers: cors });
      }
    }

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
