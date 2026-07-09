// 过滤、徽章识别、去重/近似去重
import { createHash } from 'node:crypto';

// ---------- 关键词过滤 ----------
export function makeMatchers(cfg) {
  const cityWords = (cfg.city_keywords || []).map((w) => String(w).toLowerCase());
  const hotPlayers = (cfg.hot_players || []).map((w) => String(w).toLowerCase());
  const transferWords = (cfg.transfer_keywords || []).map((w) => String(w).toLowerCase());
  const isCity = (text) => {
    const t = text.toLowerCase();
    return cityWords.some((w) => t.includes(w)) || hotPlayers.some((w) => t.includes(w));
  };
  const isTransfer = (text) => {
    const t = text.toLowerCase();
    return transferWords.some((w) => t.includes(w));
  };
  return { isCity, isTransfer };
}

export function passFilter(mode, text, m) {
  switch (mode) {
    case 'none': return true;
    case 'city': return m.isCity(text);
    case 'transfer': return m.isTransfer(text);
    case 'city+transfer': return m.isCity(text) && m.isTransfer(text);
    default: return m.isCity(text) && m.isTransfer(text);
  }
}

// ---------- 事件徽章 ----------
const BADGE_RULES = [
  ['HERE_WE_GO', /here\s+we\s+go/i],
  ['DONE_DEAL', /done\s+deal|deal\s+done|completed\s+(?:the\s+)?(?:signing|transfer|move)|has\s+signed|signs\s+for|welcome\s+to/i],
  ['OFFICIAL', /\bofficial(?:ly)?\b|\bconfirmed\b|announce/i],
  ['EXCLUSIVE', /\bexcl(?:usive)?\b/i],
  ['MEDICAL', /\bmedical\b/i],
  ['AGREEMENT', /agreement|agreed|deal\s+(?:in\s+place|reached|struck)/i],
  ['PERSONAL_TERMS', /personal\s+terms/i],
  ['BID', /\bbid\b|offer\s+(?:submitted|made|sent)/i],
  ['YOUTH', /\bacademy\b|\byouth\b|\bu2[13]\b|\bu18\b|\beds\b/i],
];
export function detectBadges(text) {
  const out = [];
  for (const [name, re] of BADGE_RULES) if (re.test(text)) out.push(name);
  return out;
}

// ---------- 去重 ----------
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    const junk = [...u.searchParams.keys()].filter((k) => /^(utm_|fbclid|gclid|cmp|ito|ref$|source$)/i.test(k));
    junk.forEach((k) => u.searchParams.delete(k));
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    return s.endsWith('/') ? s.slice(0, -1) : s;
  } catch { return url; }
}

export function makeId(url) {
  // 推文用 status id，文章用归一化 URL
  const m = String(url).match(/status\/(\d+)/);
  const key = m ? `tw:${m[1]}` : normalizeUrl(url);
  return createHash('sha1').update(key).digest('hex').slice(0, 16);
}

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'have', 'has', 'are', 'was', 'will', 'from', 'been', 'his', 'her', 'their', 'over', 'after', 'into', 'about', 'man', 'manchester', 'city', 'mcfc', 'transfer', 'news', 'live', 'latest']);
export function tokens(text) {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9À-ɏ\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const TIER_RANK = { T0: 0, T1: 1, T2: 2, ITK: 3 };

/**
 * 把新条目合并进已有列表：完全重复丢弃；近似重复折叠成 dupes；否则加入。
 * 返回合并后的列表（不排序）。
 */
export function mergeItems(existing, incoming, { windowMs = 48 * 3600e3, threshold = 0.75 } = {}) {
  const byId = new Map(existing.map((it) => [it.id, it]));
  const withTokens = existing.map((it) => ({ it, tok: tokens(it.text || '') }));

  for (const item of incoming) {
    if (byId.has(item.id)) continue;
    const t = new Date(item.published_at).getTime();
    const tok = tokens(item.text || '');
    let folded = false;
    for (const { it, tok: etok } of withTokens) {
      if (Math.abs(t - new Date(it.published_at).getTime()) > windowMs) continue;
      if (jaccard(tok, etok) < threshold) continue;
      // 近似重复：保留 tier 更高者为主条目
      if ((TIER_RANK[item.tier] ?? 9) < (TIER_RANK[it.tier] ?? 9)) {
        item.dupes = [...(it.dupes || []), { source_name: it.source_name, source_name_zh: it.source_name_zh, tier: it.tier, url: it.url }].slice(0, 6);
        // 用新条目替换旧条目
        Object.assign(it, item);
      } else if ((it.dupes || []).length < 6 && !(it.dupes || []).some((d) => d.url === item.url) && it.url !== item.url) {
        it.dupes = [...(it.dupes || []), { source_name: item.source_name, source_name_zh: item.source_name_zh, tier: item.tier, url: item.url }];
      }
      folded = true;
      break;
    }
    if (!folded) {
      byId.set(item.id, item);
      withTokens.push({ it: item, tok });
      existing.push(item);
    }
  }
  return existing;
}
