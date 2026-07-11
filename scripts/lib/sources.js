// 三类信源的抓取适配器：rss / gnews / twitter(RSSHub)
import { httpGet } from './http.js';
import { parseFeed, htmlToText, toISO } from './rss.js';

// ---------- 官方 RSS ----------
export async function fetchRss(src) {
  const xml = await httpGet(src.url);
  return parseFeed(xml).map((e) => ({
    kind: 'article',
    text: e.title,
    url: e.link,
    published_at: toISO(e.date),
  }));
}

// ---------- Google News 站内检索 ----------
// 不同语言媒体必须用对应的 Google News 版本，否则搜不到
const GNEWS_LOCALES = {
  'en-GB': ['en-GB', 'GB', 'GB:en'],
  'en-US': ['en-US', 'US', 'US:en'],
  de: ['de', 'DE', 'DE:de'],
  es: ['es', 'ES', 'ES:es'],
  'es-419': ['es-419', 'AR', 'AR:es-419'],
  it: ['it', 'IT', 'IT:it'],
  fr: ['fr', 'FR', 'FR:fr'],
  'pt-PT': ['pt-PT', 'PT', 'PT:pt-150'],
};

export async function fetchGnews(src) {
  const [hl, gl, ceid] = GNEWS_LOCALES[src.locale || 'en-GB'] || GNEWS_LOCALES['en-GB'];
  const q = encodeURIComponent(`"Manchester City" site:${src.site} when:7d`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
  const xml = await httpGet(url);
  return parseFeed(xml).map((e) => ({
    kind: 'article',
    // Google News 标题末尾会带 " - 媒体名"，去掉
    text: e.title.replace(/\s+-\s+[^-]+$/, ''),
    url: e.link,
    published_at: toISO(e.date),
  }));
}

// ---------- X 时间线（经 RSSHub） ----------
export async function fetchTwitter(src, { rsshubUrl, excludeRetweets = true, excludeReplies = true }) {
  const url = `${rsshubUrl.replace(/\/$/, '')}/twitter/user/${src.handle}`;
  const xml = await httpGet(url, { timeout: 30000 });
  const out = [];
  for (const e of parseFeed(xml)) {
    const text = htmlToText(e.html) || htmlToText(e.title);
    const t = (htmlToText(e.title) || text).trim();
    // RSSHub 的转推标题有 "RT @user:" 和 "RT 昵称" 两种形态
    if (excludeRetweets && (/^RT[ :@]/i.test(t) || /^RT[ :@]/i.test(text))) continue;
    if (excludeReplies && /^Re[ :@]/i.test(t)) continue;
    out.push({
      kind: 'tweet',
      text: text.slice(0, 1200),
      url: e.link,
      published_at: toISO(e.date),
    });
  }
  return out;
}

// ---------- 焦点对象专属检索（开放搜索，仅收白名单媒体，把 T3 挡在门外） ----------
// 白名单 = 已配置信源的域名 → 对应信源（借用其名称/分级）
export function buildDomainMap(sources) {
  const map = new Map();
  const put = (host, src) => {
    host = String(host || '').toLowerCase().replace(/^www\./, '');
    if (host && !map.has(host)) map.set(host, src);
  };
  for (const s of sources) {
    if (s.type === 'gnews' && s.site) put(s.site.split('/')[0], s);
    else if (s.type === 'rss' && s.url) { try { put(new URL(s.url).hostname, s); } catch { /* 忽略坏URL */ } }
  }
  // RSS 源域名与文章域名不一致的已知别称
  const bbc = sources.find((s) => s.key === 'bbc_city');
  if (bbc) { put('bbc.co.uk', bbc); put('bbc.com', bbc); }
  return map;
}

function domainMatch(map, url) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
  if (map.has(host)) return map.get(host);
  for (const [k, v] of map) {
    if (host.endsWith(`.${k}`) || k.endsWith(`.${host}`)) return v;
  }
  return null;
}

export async function fetchFocusGnews(target, domainMap) {
  const q = encodeURIComponent(`"${target.query || target.aliases?.[0] || target.name}" when:7d`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-GB&gl=GB&ceid=GB:en`;
  const xml = await httpGet(url);
  const out = [];
  for (const e of parseFeed(xml)) {
    const outlet = e.source ? domainMatch(domainMap, e.source.url) : null;
    if (!outlet) continue; // 白名单外（含 T3 厕纸媒体）不收
    out.push({
      kind: 'article',
      text: e.title.replace(/\s+-\s+[^-]+$/, ''),
      url: e.link,
      published_at: toISO(e.date),
      outlet,
    });
  }
  return out;
}

// ---------- 统一入口 ----------
export async function fetchSource(src, ctx) {
  if (src.type === 'rss') return fetchRss(src);
  if (src.type === 'gnews') return fetchGnews(src);
  if (src.type === 'twitter') {
    if (!ctx.rsshubUrl) return null; // 推文通道未启用
    return fetchTwitter(src, ctx);
  }
  throw new Error(`未知信源类型: ${src.type}`);
}
