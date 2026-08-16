// Cloudflare Pages 的互动接口。
// /prayer、/reactions 与 /comments 走 D1；其他路径继续交给 Pages 静态资源服务。

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
const COMMENT_RATE_SECONDS = 30;
const COMMENT_IP_RATE_SECONDS = 3;
const NICKNAME_CHANGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_COMMENT_IDS = 48;
const SURVEY_RATE_SECONDS = 2;
const SURVEY_IP_DEVICE_LIMIT = 3;
const SURVEY_RULES = Object.freeze({
  coach_debut_2026: {
    closes_at: null,
    questions: {
      score: { type: 'number', min: 0, max: 10 },
      attitude: { type: 'single', options: ['believe', 'three_games', 'next_meeting', 'miss_previous', 'surrender'] },
      blame: { type: 'single', options: ['coach_all', 'coach_main', 'players', 'recruitment', 'shield_only'] },
    },
  },
  midfield_final_2026: {
    closes_at: Date.parse('2026-08-14T16:00:00Z'),
    combination_questions: ['enzo', 'rodri', 'bouaddi'],
    questions: {
      enzo: { type: 'single', options: ['join', 'stay'] },
      rodri: { type: 'single', options: ['stay', 'leave'] },
      bouaddi: { type: 'single', options: ['join', 'later'] },
    },
  },
  summer_2026: {
    closes_at: Date.parse('2026-09-01T17:00:00Z'),
    questions: {
      score: { type: 'number', min: 0, max: 10 },
      positions: { type: 'multi', max: 2, options: ['cb', 'fb', 'dm', 'cm', 'winger', 'striker', 'none'], exclusive: 'none' },
      arrivals: { type: 'single', options: ['0', '1', '2', '3plus'] },
      strategy: { type: 'single', options: ['ready', 'youth', 'loan', 'sell_first', 'no_panic'] },
      satisfaction: { type: 'single', options: ['quality', 'speed', 'youth', 'sales', 'spend', 'none'] },
      unacceptable: { type: 'single', options: ['gap', 'panic', 'overpay', 'core_exit', 'empty_rumors', 'next_window'] },
      confidence: { type: 'single', options: ['none', 'low', 'half', 'high', 'saint'] },
      era: { type: 'single', optional: true, options: ['sun_jihai', 'takeover', 'aguero', 'pep', 'haaland', 'new'] },
    },
  },
  site_experience_2026: {
    closes_at: null,
    questions: {
      rating: { type: 'number', min: 1, max: 5 },
      favorites: { type: 'multi', max: 2, options: ['chinese', 'bilingual', 'tiers', 'focus', 'follow', 'comments', 'reactions', 'share', 'filters'] },
      improvements: { type: 'multi', max: 2, options: ['freshness', 'translation', 'sources', 'duplicates', 'mobile_space', 'readability', 'filters', 'comments', 'performance'] },
      density: { type: 'single', options: ['too_dense', 'right', 'more_compact', 'too_little'] },
      next_feature: { type: 'single', options: ['follow_alerts', 'timeline', 'daily_digest', 'custom_sources', 'breaking_push', 'more_polls'] },
      sharing: { type: 'single', options: ['already', 'breaking_only', 'better_first', 'not_now'] },
    },
  },
});
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
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS survey_ballots (' +
        'poll_id TEXT NOT NULL, voter_id TEXT NOT NULL, answers TEXT NOT NULL, ' +
        'created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, revision_count INTEGER NOT NULL DEFAULT 0, ' +
        'PRIMARY KEY (poll_id, voter_id))',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS survey_ip_claims (' +
        'poll_id TEXT NOT NULL, ip_hash TEXT NOT NULL, voter_id TEXT NOT NULL, created_at INTEGER NOT NULL, ' +
        'PRIMARY KEY (poll_id, ip_hash, voter_id))',
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_survey_ballots_poll ON survey_ballots(poll_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_survey_ip_claims_poll_ip ON survey_ip_claims(poll_id, ip_hash)'),
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

function surveyRule(pollId) {
  return Object.prototype.hasOwnProperty.call(SURVEY_RULES, pollId) ? SURVEY_RULES[pollId] : null;
}

function validateSurveyAnswers(pollId, value) {
  const poll = surveyRule(pollId);
  if (!poll || !value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'bad_answers' };
  }
  const answers = {};
  for (const [questionId, rule] of Object.entries(poll.questions)) {
    const raw = value[questionId];
    if (raw == null || raw === '') {
      if (rule.optional) continue;
      return { ok: false, reason: 'missing_answer', question: questionId };
    }
    if (rule.type === 'number') {
      const number = Number(raw);
      if (!Number.isInteger(number) || number < rule.min || number > rule.max) {
        return { ok: false, reason: 'bad_answer', question: questionId };
      }
      answers[questionId] = number;
      continue;
    }
    if (rule.type === 'single') {
      const option = String(raw);
      if (!rule.options.includes(option)) return { ok: false, reason: 'bad_answer', question: questionId };
      answers[questionId] = option;
      continue;
    }
    if (rule.type === 'multi') {
      const options = [...new Set(Array.isArray(raw) ? raw.map(String) : [])];
      if (options.length === 0 || options.length > rule.max || options.some((option) => !rule.options.includes(option))) {
        return { ok: false, reason: 'bad_answer', question: questionId };
      }
      if (rule.exclusive && options.includes(rule.exclusive) && options.length > 1) {
        return { ok: false, reason: 'bad_answer', question: questionId };
      }
      answers[questionId] = options;
    }
  }
  return { ok: true, answers };
}

async function surveyIpHash(env, request, pollId) {
  const key = 'survey_ip_salt_v1';
  let row = await env.DB.prepare('SELECT value FROM interaction_meta WHERE key = ?').bind(key).first();
  if (!row) {
    const salt = crypto.randomUUID().replace(/-/g, '');
    await env.DB.prepare('INSERT OR IGNORE INTO interaction_meta (key, value) VALUES (?, ?)').bind(key, salt).run();
    row = await env.DB.prepare('SELECT value FROM interaction_meta WHERE key = ?').bind(key).first();
  }
  const ip = request.headers.get('CF-Connecting-IP') || 'anonymous';
  const bytes = new TextEncoder().encode(`${String(row?.value || '')}|${pollId}|${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readSurveyBallot(env, pollId, voterId) {
  await ensureSchema(env);
  if (!VOTER_ID_RE.test(voterId)) return null;
  const row = await env.DB.prepare(
    'SELECT answers, created_at, updated_at, revision_count FROM survey_ballots WHERE poll_id = ? AND voter_id = ?',
  ).bind(pollId, voterId).first();
  if (!row) return null;
  try {
    return {
      answers: JSON.parse(String(row.answers || '{}')),
      created_at: Number(row.created_at || 0),
      updated_at: Number(row.updated_at || 0),
      revision_count: Math.max(0, Number(row.revision_count || 0)),
    };
  } catch { return null; }
}

async function readSurveyResults(env, pollId) {
  await ensureSchema(env);
  const poll = surveyRule(pollId);
  const rows = await env.DB.prepare(
    'SELECT answers, updated_at FROM survey_ballots WHERE poll_id = ? ORDER BY updated_at DESC',
  ).bind(pollId).all();
  const questions = {};
  for (const [questionId, rule] of Object.entries(poll.questions)) {
    const optionKeys = rule.type === 'number'
      ? Array.from({ length: rule.max - rule.min + 1 }, (_, index) => String(rule.min + index))
      : rule.options;
    questions[questionId] = { counts: Object.fromEntries(optionKeys.map((key) => [key, 0])) };
    if (rule.type === 'number') questions[questionId].average = 0;
  }
  let total = 0;
  let updatedAt = 0;
  const sums = {};
  const combinationCounts = {};
  if (Array.isArray(poll.combination_questions)) {
    const buildCombinationKeys = (index, values) => {
      if (index >= poll.combination_questions.length) {
        combinationCounts[values.join('|')] = 0;
        return;
      }
      const question = poll.questions[poll.combination_questions[index]];
      for (const option of question?.options || []) buildCombinationKeys(index + 1, [...values, option]);
    };
    buildCombinationKeys(0, []);
  }
  for (const row of rows.results || []) {
    let answers;
    try { answers = JSON.parse(String(row.answers || '{}')); } catch { continue; }
    total += 1;
    updatedAt = Math.max(updatedAt, Number(row.updated_at || 0));
    if (Array.isArray(poll.combination_questions)) {
      const values = poll.combination_questions.map((questionId) => String(answers[questionId] || ''));
      const key = values.join('|');
      if (values.every(Boolean) && Object.prototype.hasOwnProperty.call(combinationCounts, key)) combinationCounts[key] += 1;
    }
    for (const [questionId, rule] of Object.entries(poll.questions)) {
      const value = answers[questionId];
      if (value == null) continue;
      if (rule.type === 'multi') {
        for (const option of Array.isArray(value) ? value : []) {
          if (Object.prototype.hasOwnProperty.call(questions[questionId].counts, option)) {
            questions[questionId].counts[option] += 1;
          }
        }
      } else {
        const key = String(value);
        if (Object.prototype.hasOwnProperty.call(questions[questionId].counts, key)) {
          questions[questionId].counts[key] += 1;
          if (rule.type === 'number') sums[questionId] = Number(sums[questionId] || 0) + Number(value);
        }
      }
    }
  }
  for (const [questionId, rule] of Object.entries(poll.questions)) {
    if (rule.type === 'number') {
      questions[questionId].average = total > 0 ? Math.round((Number(sums[questionId] || 0) / total) * 100) / 100 : 0;
    }
  }
  return {
    total,
    updated_at: updatedAt,
    questions,
    ...(Array.isArray(poll.combination_questions) ? { combinations: { counts: combinationCounts } } : {}),
  };
}

async function saveSurveyBallot(env, request, pollId, voterId, answers) {
  await ensureSchema(env);
  const existing = await env.DB.prepare(
    'SELECT 1 AS yes FROM survey_ballots WHERE poll_id = ? AND voter_id = ?',
  ).bind(pollId, voterId).first();
  if (!existing) {
    const ipHash = await surveyIpHash(env, request, pollId);
    const claim = await env.DB.prepare(
      'SELECT 1 AS yes FROM survey_ip_claims WHERE poll_id = ? AND ip_hash = ? AND voter_id = ?',
    ).bind(pollId, ipHash, voterId).first();
    if (!claim) {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO survey_ip_claims (poll_id, ip_hash, voter_id, created_at) VALUES (?, ?, ?, ?)',
      ).bind(pollId, ipHash, voterId, Date.now()).run();
      const count = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM survey_ip_claims WHERE poll_id = ? AND ip_hash = ?',
      ).bind(pollId, ipHash).first();
      if (Number(count?.n || 0) > SURVEY_IP_DEVICE_LIMIT) {
        await env.DB.prepare(
          'DELETE FROM survey_ip_claims WHERE poll_id = ? AND ip_hash = ? AND voter_id = ?',
        ).bind(pollId, ipHash, voterId).run();
        return { ok: false, reason: 'ip_limit' };
      }
    }
  }
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO survey_ballots (poll_id, voter_id, answers, created_at, updated_at, revision_count) ' +
      'VALUES (?, ?, ?, ?, ?, 0) ON CONFLICT(poll_id, voter_id) DO UPDATE SET ' +
      'answers = excluded.answers, updated_at = excluded.updated_at, revision_count = survey_ballots.revision_count + 1',
  ).bind(pollId, voterId, JSON.stringify(answers), now, now).run();
  return { ok: true };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!['/prayer', '/reactions', '/comments', '/surveys'].includes(url.pathname)) return env.ASSETS.fetch(request);

    const origin = request.headers.get('Origin') || '';
    const headers = responseHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (origin && !ALLOW_ORIGINS.includes(origin)) return json({ ok: false, reason: 'origin' }, headers, 403);
    if (!env.DB) return json({ ok: false, reason: 'no_db' }, headers, 503);

    try {
      if (url.pathname === '/surveys') {
        const pollId = String(url.searchParams.get('poll') || '');
        const poll = surveyRule(pollId);
        if (!poll) return json({ ok: false, reason: 'bad_poll' }, headers, 400);
        const closed = Number.isFinite(poll.closes_at) && Date.now() >= poll.closes_at;
        if (request.method === 'GET') {
          const voterId = String(url.searchParams.get('voter') || '');
          return json({
            ok: true,
            poll: pollId,
            closes_at: poll.closes_at,
            closed,
            ballot: await readSurveyBallot(env, pollId, voterId),
            results: await readSurveyResults(env, pollId),
          }, headers);
        }
        if (request.method === 'POST') {
          if (closed) return json({ ok: false, reason: 'closed', closed: true }, headers, 409);
          const body = await request.json().catch(() => ({}));
          const voterId = String(body.voter || '');
          if (!VOTER_ID_RE.test(voterId) || String(body.poll || '') !== pollId) {
            return json({ ok: false, reason: 'bad_request' }, headers, 400);
          }
          const checked = validateSurveyAnswers(pollId, body.answers);
          if (!checked.ok) return json(checked, headers, 400);
          const cache = caches.default;
          const ipHash = await surveyIpHash(env, request, pollId);
          const ipGate = new Request(`https://survey-ip-limit.internal/${pollId}/${ipHash}`);
          const voterGate = new Request(`https://survey-voter-limit.internal/${pollId}/${voterId}`);
          if (await cache.match(ipGate) || await cache.match(voterGate)) {
            return json({ ok: false, reason: 'slow_down' }, { ...headers, 'retry-after': String(SURVEY_RATE_SECONDS) }, 429);
          }
          const saved = await saveSurveyBallot(env, request, pollId, voterId, checked.answers);
          if (!saved.ok) return json(saved, headers, saved.reason === 'ip_limit' ? 429 : 400);
          await Promise.all([
            cache.put(ipGate, new Response('1', { headers: { 'cache-control': `max-age=${SURVEY_RATE_SECONDS}` } })),
            cache.put(voterGate, new Response('1', { headers: { 'cache-control': `max-age=${SURVEY_RATE_SECONDS}` } })),
          ]);
          return json({
            ok: true,
            poll: pollId,
            closes_at: poll.closes_at,
            closed: false,
            ballot: await readSurveyBallot(env, pollId, voterId),
            results: await readSurveyResults(env, pollId),
          }, headers);
        }
        return json({ ok: false, reason: 'method' }, headers, 405);
      }

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

      if (url.pathname === '/comments') {
        if (request.method === 'GET') {
          const itemId = String(url.searchParams.get('item') || '');
          if (itemId) {
            if (!ITEM_ID_RE.test(itemId)) return json({ ok: false, reason: 'bad_item' }, headers, 400);
            const voterId = String(url.searchParams.get('voter') || '');
            return json({
              ok: true,
              ...(await readComments(env, itemId, VOTER_ID_RE.test(voterId) ? voterId : '')),
            }, headers);
          }
          const ids = parseCommentIds(url);
          if (ids === null || ids.length === 0) return json({ ok: false, reason: 'bad_ids' }, headers, 400);
          return json({ ok: true, counts: await readCommentCounts(env, ids) }, headers);
        }
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const guestId = String(body.voter || '');
          if (!VOTER_ID_RE.test(guestId)) return json({ ok: false, reason: 'bad_request' }, headers, 400);
          if (body.action === 'report') {
            const result = await reportComment(env, String(body.comment_id || ''), guestId);
            return json(result, headers, result.ok ? 200 : (result.reason === 'not_found' ? 404 : 400));
          }
          if (body.action === 'like') {
            const result = await setCommentLike(env, String(body.comment_id || ''), guestId, body.liked);
            return json(result, headers, result.ok ? 200 : (result.reason === 'not_found' ? 404 : 400));
          }
          const itemId = String(body.id || '');
          if (!ITEM_ID_RE.test(itemId)) return json({ ok: false, reason: 'bad_request' }, headers, 400);
          const cache = caches.default;
          const ip = request.headers.get('CF-Connecting-IP') || 'anonymous';
          const ipGate = new Request(`https://comment-ip-limit.internal/${encodeURIComponent(ip)}`);
          const guestGate = new Request(`https://comment-guest-limit.internal/${encodeURIComponent(guestId)}`);
          if (await cache.match(ipGate) || await cache.match(guestGate)) {
            return json({ ok: false, reason: 'slow_down' }, { ...headers, 'retry-after': String(COMMENT_RATE_SECONDS) }, 429);
          }
          const result = await createComment(env, itemId, guestId, body.nickname, body.comment, body.parent_id);
          if (!result.ok) {
            const status = result.reason === 'slow_down' ? 429 : result.reason === 'nickname_locked' ? 409 : 400;
            return json(result, headers, status);
          }
          await Promise.all([
            cache.put(ipGate, new Response('1', { headers: { 'cache-control': `max-age=${COMMENT_IP_RATE_SECONDS}` } })),
            cache.put(guestGate, new Response('1', { headers: { 'cache-control': `max-age=${COMMENT_RATE_SECONDS}` } })),
          ]);
          return json(result, headers);
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
