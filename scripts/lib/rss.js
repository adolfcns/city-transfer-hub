// RSS 2.0 / Atom 解析 → 统一 [{title, link, html, date}]
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: true,
  parseTagValue: false,
  // 描述/正文里常有内嵌 HTML（<br>、<img>…），当原始文本处理，防止解析器把结构吞掉
  stopNodes: ['*.description', '*.content:encoded', '*.content', '*.summary'],
});

const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const txt = (x) => (x == null ? '' : typeof x === 'object' ? (x['#text'] ?? '') : String(x));

export function parseFeed(xml) {
  const doc = parser.parse(xml);
  // RSS 2.0
  if (doc.rss?.channel) {
    return arr(doc.rss.channel.item).map((it) => ({
      title: txt(it.title).trim(),
      link: txt(it.link).trim() || it.guid?.['#text'] || txt(it.guid).trim(),
      html: txt(it['content:encoded']) || txt(it.description),
      date: txt(it.pubDate) || txt(it['dc:date']),
    }));
  }
  // Atom
  if (doc.feed) {
    return arr(doc.feed.entry).map((it) => {
      const links = arr(it.link);
      const alt = links.find((l) => l['@_rel'] === 'alternate') || links[0];
      return {
        title: txt(it.title).trim(),
        link: alt?.['@_href'] || txt(it.id),
        html: txt(it.content) || txt(it.summary),
        date: txt(it.published) || txt(it.updated),
      };
    });
  }
  throw new Error('无法识别的 feed 格式');
}

// HTML → 纯文本（推文正文、文章摘要用）
// 注意顺序：stopNodes 拿到的内容里 HTML 是转义形态（&lt;br&gt;），
// 必须【先解转义、再删标签】，反过来标签会以文本形式漏进正文
export function htmlToText(html) {
  if (!html) return '';
  let s = String(html)
    .replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
  // 1) 解转义（&amp; 最后解，避免 &amp;lt; 双重解码）
  s = s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
  // 2) 删标签（引用推文块保留内容并加 ↪ 标记）
  s = s
    .replace(/<div[^>]*class="rsshub-quote"[^>]*>/gi, '\n↪ ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|blockquote)>/gi, '\n')
    .replace(/<video[\s\S]*?(<\/video>|$)/gi, ' ')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<hr[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return s.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

export function toISO(dateStr) {
  const t = Date.parse(dateStr);
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}
