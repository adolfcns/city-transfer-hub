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
const COMMENT_RATE_SECONDS = 30;
const COMMENT_IP_RATE_SECONDS = 3;
const NICKNAME_CHANGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_COMMENT_IDS = 48;
const NICKNAME_BLOCKED_TERMS = [
  '站长', '管理员', '官方', '客服', '系统', '小编',
  '总书记', '国家主席', '主席', '总理', '总统', '首相', '议员', '部长', '市长', '省长', '州长',
  '国王', '女王', '皇帝', '天皇', '领袖', '政府', '政党', '共产党', '国民党', '民主党', '共和党',
  '议会', '国务院', '中南海', '白宫', '克里姆林宫', '人大', '政协', '外交部',
  '习近平', '毛泽东', '邓小平', '江泽民', '胡锦涛', '李强', '李克强', '孙中山', '蒋介石',
  '特朗普', '川普', '拜登', '奥巴马', '克林顿', '布什', '普京', '泽连斯基', '马克龙',
  '默克尔', '朔尔茨', '斯塔默', '苏纳克', '约翰逊', '莫迪', '石破茂', '岸田文雄',
  '安倍晋三', '金正恩', '金正日', '尹锡悦', '李在明', '文在寅', '卢拉', '博索纳罗',
  '马杜罗', '卡斯特罗', '列宁', '斯大林', '希特勒', '墨索里尼', '马克思', '恩格斯',
  '切格瓦拉', '撒切尔', '丘吉尔', '里根', '戈尔巴乔夫', '叶利钦', '阿萨德',
  '内塔尼亚胡', '哈梅内伊', '霍梅尼', '埃尔多安', '欧尔班',
  'president', 'premier', 'primeminister', 'minister', 'senator', 'congress', 'government',
  'communist', 'democrat', 'republican', 'putin', 'trump', 'biden', 'obama', 'xijinping',
  'zelensky', 'macron', 'modi', 'hitler', 'stalin', 'lenin', 'maozedong',
];
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
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS comment_profiles (' +
        'guest_id TEXT PRIMARY KEY, nickname TEXT NOT NULL, nickname_norm TEXT NOT NULL, ' +
        'nickname_updated_at INTEGER NOT NULL, created_at INTEGER NOT NULL, last_comment_at INTEGER NOT NULL DEFAULT 0)',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS comments (' +
        'id TEXT PRIMARY KEY, item_id TEXT NOT NULL, guest_id TEXT NOT NULL, nickname TEXT NOT NULL, ' +
        'body TEXT NOT NULL, created_at INTEGER NOT NULL, report_count INTEGER NOT NULL DEFAULT 0, ' +
        'hidden INTEGER NOT NULL DEFAULT 0)',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS comment_reports (' +
        'comment_id TEXT NOT NULL, reporter_id TEXT NOT NULL, created_at INTEGER NOT NULL, ' +
        'PRIMARY KEY (comment_id, reporter_id))',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS comment_likes (' +
        'comment_id TEXT NOT NULL, voter_id TEXT NOT NULL, created_at INTEGER NOT NULL, ' +
        'PRIMARY KEY (comment_id, voter_id))',
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_comments_item_created ON comments(item_id, created_at DESC)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_comment_reports_comment ON comment_reports(comment_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id)'),
  ]);
  // 兼容已经在线运行的旧评论表：保留全部评论，只补充一级回复关系。
  let commentColumns = await env.DB.prepare('PRAGMA table_info(comments)').all();
  if (!(commentColumns.results || []).some((column) => String(column.name) === 'parent_id')) {
    try {
      await env.DB.prepare('ALTER TABLE comments ADD COLUMN parent_id TEXT').run();
    } catch {
      // 多个 Worker 实例可能同时执行迁移；只有确认字段仍不存在时才抛错。
      commentColumns = await env.DB.prepare('PRAGMA table_info(comments)').all();
      if (!(commentColumns.results || []).some((column) => String(column.name) === 'parent_id')) throw new Error('comment_schema');
    }
  }
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id)').run();
  const historySeeded = await env.DB.prepare('SELECT value FROM interaction_meta WHERE key = ?')
    .bind('reaction_history_v1').first();
  if (!historySeeded) {
    // 旧数据只记录了最后一次选择；先登记为已计数，避免用户切回旧表情时重复增加。
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

function normalizeNickname(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function compactNickname(value) {
  return normalizeNickname(value).toLocaleLowerCase('zh-CN').replace(/[^\p{Script=Han}a-z0-9]/gu, '');
}

function validateNickname(value) {
  const nickname = normalizeNickname(value);
  const length = [...nickname].length;
  if (length < 2 || length > 10) return { ok: false, reason: 'nickname_length' };
  const normalized = compactNickname(nickname);
  if (!normalized || NICKNAME_BLOCKED_TERMS.some((term) => normalized.includes(compactNickname(term)))) {
    return { ok: false, reason: 'nickname_blocked' };
  }
  if (!/^[\p{Script=Han}A-Za-z0-9·._-]+$/u.test(nickname)) return { ok: false, reason: 'nickname_chars' };
  return { ok: true, nickname, normalized };
}

function validateCommentBody(value) {
  const body = String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const length = [...body].length;
  if (length < 2 || length > 120) return { ok: false, reason: 'comment_length' };
  if (/(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|cn|net|org|io|top|xyz)\b)/i.test(body)) {
    return { ok: false, reason: 'comment_link' };
  }
  return { ok: true, body };
}

function parseCommentIds(url) {
  const raw = url.searchParams.get('ids');
  if (!raw) return [];
  const ids = [...new Set(raw.split(',').map((id) => id.trim()).filter(Boolean))];
  if (ids.length > MAX_COMMENT_IDS || ids.some((id) => !ITEM_ID_RE.test(id))) return null;
  return ids;
}

async function readCommentCounts(env, ids) {
  await ensureSchema(env);
  if (!ids.length) return {};
  const result = await env.DB.prepare(
    `SELECT c.item_id, COUNT(*) AS n FROM comments c LEFT JOIN comments p ON p.id = c.parent_id ` +
      `WHERE c.hidden = 0 AND (c.parent_id IS NULL OR p.hidden = 0) ` +
      `AND c.item_id IN (${ids.map(() => '?').join(',')}) GROUP BY c.item_id`,
  ).bind(...ids).all();
  const counts = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const row of result.results || []) {
    if (ITEM_ID_RE.test(row.item_id)) counts[row.item_id] = Math.max(0, Number(row.n || 0));
  }
  return counts;
}

async function readComments(env, itemId, voterId = '') {
  await ensureSchema(env);
  const result = await env.DB.prepare(
    'SELECT c.id, c.parent_id, c.nickname, c.body, c.created_at, c.report_count, p.nickname AS parent_nickname, ' +
      '(SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id = c.id) AS like_count, ' +
      'EXISTS(SELECT 1 FROM comment_likes mine WHERE mine.comment_id = c.id AND mine.voter_id = ?) AS liked_by_me ' +
      'FROM comments c LEFT JOIN comments p ON p.id = c.parent_id ' +
      'WHERE c.item_id = ? AND c.hidden = 0 AND (c.parent_id IS NULL OR p.hidden = 0) ' +
      'ORDER BY c.created_at DESC LIMIT 100',
  ).bind(voterId, itemId).all();
  const comments = (result.results || []).map((row) => ({
    id: String(row.id),
    parent_id: row.parent_id ? String(row.parent_id) : null,
    parent_nickname: row.parent_nickname ? String(row.parent_nickname) : '',
    nickname: String(row.nickname),
    body: String(row.body),
    created_at: Number(row.created_at),
    report_count: Math.max(0, Number(row.report_count || 0)),
    like_count: Math.max(0, Number(row.like_count || 0)),
    liked_by_me: Number(row.liked_by_me || 0) === 1,
  }));
  const count = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM comments c LEFT JOIN comments p ON p.id = c.parent_id ' +
      'WHERE c.item_id = ? AND c.hidden = 0 AND (c.parent_id IS NULL OR p.hidden = 0)',
  )
    .bind(itemId).first();
  return { comments, count: Math.max(0, Number(count?.n || 0)) };
}

async function createComment(env, itemId, guestId, nicknameValue, bodyValue, parentIdValue = '') {
  const nicknameResult = validateNickname(nicknameValue);
  if (!nicknameResult.ok) return nicknameResult;
  const bodyResult = validateCommentBody(bodyValue);
  if (!bodyResult.ok) return bodyResult;
  await ensureSchema(env);
  let parentId = null;
  if (parentIdValue) {
    const requestedParentId = String(parentIdValue);
    if (!/^cm_[A-Za-z0-9_]{8,80}$/.test(requestedParentId)) return { ok: false, reason: 'bad_parent' };
    const parent = await env.DB.prepare(
      'SELECT id, item_id, parent_id, hidden FROM comments WHERE id = ?',
    ).bind(requestedParentId).first();
    if (!parent || String(parent.item_id) !== itemId || Number(parent.hidden || 0) !== 0 || parent.parent_id) {
      return { ok: false, reason: 'bad_parent' };
    }
    parentId = requestedParentId;
  }
  const now = Date.now();
  const profile = await env.DB.prepare(
    'SELECT nickname_norm, nickname_updated_at, last_comment_at FROM comment_profiles WHERE guest_id = ?',
  ).bind(guestId).first();
  if (profile && now - Number(profile.last_comment_at || 0) < COMMENT_RATE_SECONDS * 1000) {
    return { ok: false, reason: 'slow_down' };
  }
  if (profile && String(profile.nickname_norm) !== nicknameResult.normalized
      && now - Number(profile.nickname_updated_at || 0) < NICKNAME_CHANGE_MS) {
    return { ok: false, reason: 'nickname_locked', retry_at: Number(profile.nickname_updated_at) + NICKNAME_CHANGE_MS };
  }

  const commentId = `cm_${now.toString(36)}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const nicknameChanged = !profile || String(profile.nickname_norm) !== nicknameResult.normalized;
  const nicknameUpdatedAt = nicknameChanged ? now : Number(profile.nickname_updated_at || now);
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO comment_profiles ' +
        '(guest_id, nickname, nickname_norm, nickname_updated_at, created_at, last_comment_at) VALUES (?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(guest_id) DO UPDATE SET nickname = excluded.nickname, nickname_norm = excluded.nickname_norm, ' +
        'nickname_updated_at = excluded.nickname_updated_at, last_comment_at = excluded.last_comment_at',
    ).bind(guestId, nicknameResult.nickname, nicknameResult.normalized, nicknameUpdatedAt, now, now),
    env.DB.prepare(
      'INSERT INTO comments (id, item_id, guest_id, nickname, body, created_at, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(commentId, itemId, guestId, nicknameResult.nickname, bodyResult.body, now, parentId),
  ]);
  return {
    ok: true,
    comment: {
      id: commentId, parent_id: parentId, nickname: nicknameResult.nickname, body: bodyResult.body,
      created_at: now, report_count: 0, like_count: 0, liked_by_me: false,
    },
    count: (await readComments(env, itemId)).count,
  };
}

async function setCommentLike(env, commentId, voterId, liked) {
  await ensureSchema(env);
  if (!/^cm_[A-Za-z0-9_]{8,80}$/.test(commentId) || typeof liked !== 'boolean') {
    return { ok: false, reason: 'bad_request' };
  }
  const row = await env.DB.prepare(
    'SELECT c.id FROM comments c LEFT JOIN comments p ON p.id = c.parent_id ' +
      'WHERE c.id = ? AND c.hidden = 0 AND (c.parent_id IS NULL OR p.hidden = 0)',
  ).bind(commentId).first();
  if (!row) return { ok: false, reason: 'not_found' };
  if (liked) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO comment_likes (comment_id, voter_id, created_at) VALUES (?, ?, ?)',
    ).bind(commentId, voterId, Date.now()).run();
  } else {
    await env.DB.prepare('DELETE FROM comment_likes WHERE comment_id = ? AND voter_id = ?')
      .bind(commentId, voterId).run();
  }
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM comment_likes WHERE comment_id = ?')
    .bind(commentId).first();
  const selected = await env.DB.prepare('SELECT 1 AS yes FROM comment_likes WHERE comment_id = ? AND voter_id = ?')
    .bind(commentId, voterId).first();
  return { ok: true, liked: Boolean(selected), like_count: Math.max(0, Number(count?.n || 0)) };
}

async function reportComment(env, commentId, reporterId) {
  await ensureSchema(env);
  if (!/^cm_[A-Za-z0-9_]{8,80}$/.test(commentId)) return { ok: false, reason: 'bad_request' };
  const row = await env.DB.prepare('SELECT id, hidden FROM comments WHERE id = ?').bind(commentId).first();
  if (!row || Number(row.hidden || 0) !== 0) return { ok: false, reason: 'not_found' };
  const now = Date.now();
  const inserted = await env.DB.prepare(
    'INSERT OR IGNORE INTO comment_reports (comment_id, reporter_id, created_at) VALUES (?, ?, ?)',
  ).bind(commentId, reporterId, now).run();
  if (Number(inserted.meta?.changes || 0) === 0) return { ok: true, already_reported: true, hidden: false };
  await env.DB.batch([
    env.DB.prepare('UPDATE comments SET report_count = report_count + 1 WHERE id = ?').bind(commentId),
    env.DB.prepare('UPDATE comments SET hidden = 1 WHERE id = ? AND report_count >= 3').bind(commentId),
  ]);
  const updated = await env.DB.prepare('SELECT report_count, hidden FROM comments WHERE id = ?').bind(commentId).first();
  return { ok: true, hidden: Number(updated?.hidden || 0) === 1, report_count: Number(updated?.report_count || 0) };
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

    // —— 每条消息的五种表情：每台匿名设备每种表情最多累计一次，历史次数只增不减 ——
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

    // —— 每条消息的游客短评：免注册昵称、限速、举报后自动隐藏 ——
    if (path === '/comments') {
      if (!originAllowed) {
        return new Response(JSON.stringify({ ok: false, reason: 'origin' }), { status: 403, headers: cors });
      }
      if (!env.DB) {
        return new Response(JSON.stringify({ ok: false, reason: 'no_db' }), { status: 503, headers: cors });
      }
      try {
        const url = new URL(request.url);
        if (request.method === 'GET') {
          const itemId = String(url.searchParams.get('item') || '');
          if (itemId) {
            if (!ITEM_ID_RE.test(itemId)) {
              return new Response(JSON.stringify({ ok: false, reason: 'bad_item' }), { status: 400, headers: cors });
            }
            const voterId = String(url.searchParams.get('voter') || '');
            return new Response(JSON.stringify({
              ok: true,
              ...(await readComments(env, itemId, VOTER_ID_RE.test(voterId) ? voterId : '')),
            }), { headers: cors });
          }
          const ids = parseCommentIds(url);
          if (ids === null || ids.length === 0) {
            return new Response(JSON.stringify({ ok: false, reason: 'bad_ids' }), { status: 400, headers: cors });
          }
          return new Response(JSON.stringify({ ok: true, counts: await readCommentCounts(env, ids) }), { headers: cors });
        }
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const guestId = String(body.voter || '');
          if (!VOTER_ID_RE.test(guestId)) {
            return new Response(JSON.stringify({ ok: false, reason: 'bad_request' }), { status: 400, headers: cors });
          }
          if (body.action === 'report') {
            const result = await reportComment(env, String(body.comment_id || ''), guestId);
            const status = result.ok ? 200 : result.reason === 'not_found' ? 404 : 400;
            return new Response(JSON.stringify(result), { status, headers: cors });
          }
          if (body.action === 'like') {
            const result = await setCommentLike(env, String(body.comment_id || ''), guestId, body.liked);
            const status = result.ok ? 200 : result.reason === 'not_found' ? 404 : 400;
            return new Response(JSON.stringify(result), { status, headers: cors });
          }
          const itemId = String(body.id || '');
          if (!ITEM_ID_RE.test(itemId)) {
            return new Response(JSON.stringify({ ok: false, reason: 'bad_request' }), { status: 400, headers: cors });
          }
          const cache = caches.default;
          const ip = request.headers.get('CF-Connecting-IP') || 'anonymous';
          const ipGate = new Request(`https://comment-ip-limit.internal/${encodeURIComponent(ip)}`);
          const guestGate = new Request(`https://comment-guest-limit.internal/${encodeURIComponent(guestId)}`);
          if (await cache.match(ipGate) || await cache.match(guestGate)) {
            return new Response(JSON.stringify({ ok: false, reason: 'slow_down' }), {
              status: 429, headers: { ...cors, 'retry-after': String(COMMENT_RATE_SECONDS) },
            });
          }
          const result = await createComment(env, itemId, guestId, body.nickname, body.comment, body.parent_id);
          if (!result.ok) {
            const status = result.reason === 'slow_down' ? 429 : result.reason === 'nickname_locked' ? 409 : 400;
            return new Response(JSON.stringify(result), { status, headers: cors });
          }
          await Promise.all([
            cache.put(ipGate, new Response('1', { headers: { 'cache-control': `max-age=${COMMENT_IP_RATE_SECONDS}` } })),
            cache.put(guestGate, new Response('1', { headers: { 'cache-control': `max-age=${COMMENT_RATE_SECONDS}` } })),
          ]);
          return new Response(JSON.stringify(result), { headers: cors });
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
