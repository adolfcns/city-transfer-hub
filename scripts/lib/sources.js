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
    const text = htmlToText(e.html) || e.title;
    const t = (e.title || text).trim();
    if (excludeRetweets && /^RT @/i.test(t)) continue;
    if (excludeReplies && /^R[e:] @/i.test(t)) continue;
    out.push({
      kind: 'tweet',
      text: text.slice(0, 1200),
      url: e.link,
      published_at: toISO(e.date),
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
