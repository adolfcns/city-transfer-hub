// Cloudflare Pages 的互动接口。
// /prayer 与 /reactions 走 D1；其他路径继续交给 Pages 静态资源服务。

const ALLOW_ORIGINS = [
  'https://adolfcns.github.io',
  'https://city-transfer-hub.pages.dev',
  'http://localhost:8787',
];
const PRAYER_ROW_ID = '0000000000001894';
const PRAYER_EMOJI = '💙';
const PRAYER_RATE_SECONDS = 1;
const REACTION_KEYS = ['fire', 'heart', 'watch', 'wild', 'doubt'];
const ITEM_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const VOTER_ID_RE = /^[A-Za-z0-9_-]{12,80}$/;
const MAX_REACTION_IDS = 48;
let schemaReady = false;

function responseHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };
}

function json(body, headers, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

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
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS reaction_vote_history (' +
        'item_id TEXT NOT NULL, voter_id TEXT NOT NULL, reaction TEXT NOT NULL, ' +
        'claim_id TEXT NOT NULL, created_at INTEGER NOT NULL, ' +
        'PRIMARY KEY (item_id, voter_id, reaction))',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS interaction_meta (' +
        'key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_reaction_votes_item ON reaction_votes(item_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_reaction_vote_history_item ON reaction_vote_history(item_id)'),
  ]);
  const historySeeded = await env.DB.prepare('SELECT value FROM interaction_meta WHERE key = ?')
    .bind('reaction_history_v1').first();
  if (!historySeeded) {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT OR IGNORE INTO reaction_vote_history ' +
          '(item_id, voter_id, reaction, claim_id, created_at) ' +
          `SELECT item_id, voter_id, reaction, ?, updated_at FROM reaction_votes WHERE reaction IN (${REACTION_KEYS.map(() => '?').join(',')})`,
      ).bind('legacy', ...REACTION_KEYS),
      env.DB.prepare(
        'INSERT INTO interaction_meta (key, value) VALUES (?, ?) ' +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ).bind('reaction_history_v1', String(Date.now())),
    ]);
  }
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
  const now = Date.now();
  const claimId = `c_${crypto.randomUUID().replace(/-/g, '')}`;
  await env.DB.batch([
    env.DB.prepare(
      'INSERT OR IGNORE INTO reaction_vote_history ' +
        '(item_id, voter_id, reaction, claim_id, created_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(itemId, voterId, reaction, claimId, now),
    env.DB.prepare(
      'INSERT INTO reactions (id, emoji, n) ' +
        'SELECT ?, ?, 1 WHERE EXISTS (' +
          'SELECT 1 FROM reaction_vote_history ' +
          'WHERE item_id = ? AND voter_id = ? AND reaction = ? AND claim_id = ?' +
        ') ON CONFLICT(id, emoji) DO UPDATE SET n = n + 1',
    ).bind(itemId, reaction, itemId, voterId, reaction, claimId),
    env.DB.prepare(
      'INSERT INTO reaction_votes (item_id, voter_id, reaction, updated_at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(item_id, voter_id) DO UPDATE SET reaction = excluded.reaction, updated_at = excluded.updated_at',
    ).bind(itemId, voterId, reaction, now),
  ]);
  return readReactionCounts(env, [itemId]);
}

function parseReactionIds(url) {
  const raw = url.searchParams.get('ids');
  if (!raw) return [];
  const ids = [...new Set(raw.split(',').map((id) => id.trim()).filter(Boolean))];
  if (ids.length > MAX_REACTION_IDS || ids.some((id) => !ITEM_ID_RE.test(id))) return null;
  return ids;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!['/prayer', '/reactions'].includes(url.pathname)) return env.ASSETS.fetch(request);

    const origin = request.headers.get('Origin') || '';
    const headers = responseHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (origin && !ALLOW_ORIGINS.includes(origin)) return json({ ok: false, reason: 'origin' }, headers, 403);
    if (!env.DB) return json({ ok: false, reason: 'no_db' }, headers, 503);

    try {
      if (url.pathname === '/prayer') {
        if (request.method === 'GET') return json({ ok: true, count: await readPrayerCount(env) }, headers);
        if (request.method === 'POST') {
          const cache = caches.default;
          const ip = request.headers.get('CF-Connecting-IP') || 'anonymous';
          const gate = new Request(`https://prayer-limit.internal/${encodeURIComponent(ip)}`);
          if (await cache.match(gate)) {
            return json({ ok: false, reason: 'slow_down', count: await readPrayerCount(env) }, {
              ...headers, 'retry-after': String(PRAYER_RATE_SECONDS),
            }, 429);
          }
          const count = await incrementPrayerCount(env);
          await cache.put(gate, new Response('1', {
            headers: { 'cache-control': `max-age=${PRAYER_RATE_SECONDS}` },
          }));
          return json({ ok: true, count }, headers);
        }
        return json({ ok: false, reason: 'method' }, headers, 405);
      }

      if (request.method === 'GET') {
        const ids = parseReactionIds(url);
        if (ids === null) return json({ ok: false, reason: 'bad_ids' }, headers, 400);
        return json({ ok: true, counts: await readReactionCounts(env, ids.length ? ids : null) }, headers);
      }
      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const itemId = String(body.id || '');
        const voterId = String(body.voter || '');
        const reaction = String(body.reaction || '');
        if (!ITEM_ID_RE.test(itemId) || !VOTER_ID_RE.test(voterId) || !REACTION_KEYS.includes(reaction)) {
          return json({ ok: false, reason: 'bad_request' }, headers, 400);
        }
        const counts = await recordReaction(env, itemId, voterId, reaction);
        return json({ ok: true, counts, selected: reaction }, headers);
      }
      return json({ ok: false, reason: 'method' }, headers, 405);
    } catch {
      return json({ ok: false, reason: 'db_error' }, headers, 503);
    }
  },
};
