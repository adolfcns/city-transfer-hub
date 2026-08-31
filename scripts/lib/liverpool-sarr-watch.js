// 只追踪利物浦求购水晶宫的 Ismaïla Sarr，不是热刺的 Pape Matar Sarr。
import { htmlToText } from './rss.js';
import { makeId, mergeItems, detectBadges } from './pipeline.js';

export const LIVERPOOL_SARR_QUERY = 'Liverpool "Ismaila Sarr" when:7d';
const normalize = (value) => String(value || '').toLowerCase().normalize('NFD')
  .replace(/\p{M}/gu, '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const LIVERPOOL = /\bliverpool\b|\blfc\b|利物浦/;
const SARR = /\bisma(?:i|y)la\s+sarr\b|伊斯(?:梅|迈)拉[·・\s]?萨尔/;
const PALACE = /\bcrystal palace\b|\bcpfc\b|水晶宫/;
const SURNAME = /\bsarr\b|萨尔/;
const OTHER_SARR = /\bpape(?:\s+matar)?\s+sarr\b|\bmalang\s+sarr\b|帕普|马朗/;
const TRANSFER = /\b(?:transfer\w*|bid\w*|offer\w*|approach\w*|talks|negotiat\w*|sign(?:s|ed|ing)?|target\w*|interest\w*|deal|agreement|personal terms|medical|sell|sale|pursu\w*|enquir\w*|contact\w*|join\w*|move|remain\w*|stay\w*)\b|引进|报价|求购|谈判|接触|签下|签约|加盟|转会|出售|留队|辟谣|协议|有意/;
const EXCLUDED = /women|\bwsl\b|女足|on this day|#otd|#onthisday|paper talk|media watch|sponsor|commercial|new contract|contract extension|续约|官媒转载/;
const QUESTION = /(?:should|could|does|will|can)\s+.{0,65}(?:sign|buy|need)|是否应该|应该买/;

export function isLiverpoolSarrWatchItem(text) {
  const value = normalize(text);
  if (!LIVERPOOL.test(value) || EXCLUDED.test(value) || QUESTION.test(value)) return false;
  const fullName = SARR.test(value);
  if (!fullName && (OTHER_SARR.test(value) || !PALACE.test(value) || !SURNAME.test(value))) return false;
  if (!TRANSFER.test(value)) return false;
  // 排除从利物浦离队的相反方向；卖方拒绝报价、球员留队等负面进展仍应保留。
  if (/(?:leave|leaving|left|sold by|from)\s+liverpool|liverpool.{0,35}(?:sell|selling|loan out)|离开利物浦|利物浦.{0,10}出售/.test(value)) return false;
  return true;
}

export function buildLiverpoolSarrWatchItems(previous, batches, allowedKeys, { now = Date.now(), daysKeep = 7, maxItems = 24 } = {}) {
  const cutoff = now - daysKeep * 86400e3;
  const valid = (item) => item.url && allowedKeys.has(item.source_key)
    && Number.isFinite(Date.parse(item.published_at)) && Date.parse(item.published_at) >= cutoff
    && Date.parse(item.published_at) <= now + 5 * 60e3 && isLiverpoolSarrWatchItem(item.text);
  const kept = (previous || []).map((item) => ({ ...item, text: htmlToText(item.text) || item.text })).filter(valid);
  const ids = new Set(kept.map((item) => item.id));
  const incoming = [];
  for (const { source, entries } of batches) {
    if (!source || !allowedKeys.has(source.key)) continue;
    for (const entry of entries || []) {
      if (!entry.url || !entry.text) continue;
      const item = {
        id: makeId(entry.url), source_key: source.key, source_name: source.name,
        source_name_zh: source.name_zh || source.name, tier: source.tier,
        kind: entry.kind || 'tweet', text: htmlToText(entry.text) || entry.text,
        text_zh: null, url: entry.url, published_at: entry.published_at,
        badges: detectBadges(entry.text), watch_type: 'liverpool_sarr',
        source_role_zh: source.watch_role_zh || '一线转会记者',
      };
      if (!valid(item) || ids.has(item.id)) continue;
      ids.add(item.id);
      incoming.push(item);
    }
  }
  incoming.sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at));
  return mergeItems(kept, incoming).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)).slice(0, maxItems);
}
