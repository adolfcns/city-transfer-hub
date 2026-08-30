// 蓝桥引援雷达：只收切尔西买人动态，以及恩佐加盟曼城的直接消息。
// 规则刻意独立于曼城主消息流，避免把切尔西比赛、伤病和普通离队混入首页。
const normalize = (value) => String(value || '')
  .toLowerCase()
  .replace(/[’‘]/g, "'")
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .replace(/\s+/g, ' ')
  .trim();

const CHELSEA = /(?:\bchelsea(?:\s+fc)?\b|\bcfc\b|stamford bridge|切尔西|車路士)/i;
const ENZO = /(?:\benzo(?:\s+fernandez)?\b|恩佐(?:·费尔南德斯)?)/i;
const MAN_CITY = /(?:\bmanchester city\b|\bman city\b|\bmcfc\b|曼城)/i;
const WOMEN_OR_HISTORY = /(?:chelsea women|women's team|women’s team|\bwsl\b|女足|#onthisday|on this day|#otd)/i;
const EXCLUDED_PLAYERS = /(?:\bemiliano\s+martinez\b|\bemi\s+martinez\b|\bdibu\s+martinez\b|埃米利亚诺[·・\s]?马丁内斯|埃米[·・\s]?马丁内斯|大马丁)/i;
const CONTRACT_ONLY = /(?:new contract|contract extension|renew(?:al|ed|s|ing)?|续约)/i;
const SPECULATION_ONLY = /(?:does|should|could|can|will)\s+.{0,85}(?:need|make|complete)\s+.{0,35}(?:signing|transfer)/i;
const COMMERCIAL_OR_ROUNDUP = /(?:sponsor(?:ship)?|commercial partner|front-of-shirt|financial platform|paper talk)/i;
const OUTGOING = new RegExp(
  [
    String.raw`(?:leave|leaves|leaving|left|depart(?:ure|s|ed|ing)?|exit(?:s|ed|ing)?|move(?:s|d|ing)? away from|moving from|sold by|sale by|from)\s+(?:chelsea|#?cfc)`,
    String.raw`(?:chelsea|#?cfc).{0,90}(?:sell|sold|selling|sale|loan out|send on loan|accept(?:ed|s|ing)?\s+(?:a\s+)?bid.{0,30}(?:for|from)|let.{0,25}leave|departure|exit)`,
    String.raw`(?:sale|transfer|move)\s+from\s+(?:chelsea|#?cfc)`,
    String.raw`(?:agreement|deal)\s+with\s+(?:chelsea|#?cfc)\s+to\s+sign`,
    String.raw`(?:negotiat\w*|talks?)\s+with\s+(?:chelsea|#?cfc)\s+(?:over|for)\s+(?:a\s+)?deal`,
    String.raw`(?:chelsea|#?cfc).{0,80}(?:turn(?:ed|s|ing)?\s+down|reject(?:ed|s|ing)?).{0,45}(?:approach|bid).{0,45}(?:loan|sign)`,
    String.raw`undergo\s+(?:his|a)\s+(?!chelsea\b|cfc\b)(?:[a-z][\w'-]*\s+){1,4}medical`,
    String.raw`离开切尔西|切尔西.{0,30}(?:出售|外租|接受.{0,12}报价)`
  ].join('|'),
  'i',
);
const CHELSEA_FIRST = new RegExp(
  String.raw`(?:\bchelsea(?:\s+fc)?\b|\bcfc\b|stamford bridge|切尔西|車路士).{0,110}` +
  String.raw`(?:sign(?:s|ed|ing)?|agree(?:s|d|ing)?|agreement|bid(?:s|ded|ding)?|offer(?:s|ed|ing)?|` +
  String.raw`talks?|negotiat\w*|target(?:s|ed|ing)?|interest(?:ed)?|keen|pursu\w*|want(?:s|ed|ing)?|` +
  String.raw`monitor(?:s|ed|ing)?|approach(?:es|ed|ing)?|enquir\w*|close(?:s|d|ing)?\s+(?:in|to)|` +
  String.raw`medical|personal terms|deal|fich\w*|acuerdo|oferta|negoci\w*|interes\w*|` +
  String.raw`trattativ\w*|accordo|offerta|obiettiv\w*|ingagg\w*|contrat\w*|propost\w*|` +
  String.raw`签下|签约|引进|报价|谈判|接触|有意|关注|目标|达成协议)`,
  'i',
);
const CHELSEA_DESTINATION = new RegExp(
  String.raw`(?:join(?:s|ed|ing)?|move(?:s|d|ing)?\s+to|transfer(?:s|red|ring)?\s+to|sign(?:s|ed|ing)?\s+for|` +
  String.raw`headed\s+to|on\s+(?:his|the)\s+way\s+to)\s+` +
  String.raw`(?:\bchelsea(?:\s+fc)?\b|\bcfc\b|stamford bridge|切尔西|車路士)|` +
  String.raw`(?:加盟|转会至|转投)(?:切尔西|車路士)|chelsea-bound`,
  'i',
);
const TO_CHELSEA_DEAL = new RegExp(
  String.raw`(?:\bto\s+chelsea\b|\bal\s+chelsea\b|\bpara\s+(?:o\s+)?chelsea\b|\bzum\s+chelsea\b).{0,55}` +
  String.raw`(?:here\s+we\s+go|deal|agreement|medical|personal\s+terms|confirmed|done|agreed)`,
  'i',
);

export function classifyChelseaWatch(text) {
  const value = normalize(text);
  if (
    !value
    || WOMEN_OR_HISTORY.test(value)
    || EXCLUDED_PLAYERS.test(value)
    || CONTRACT_ONLY.test(value)
    || SPECULATION_ONLY.test(value)
    || COMMERCIAL_OR_ROUNDUP.test(value)
  ) return null;

  // 只要同时明确提到恩佐、曼城和转会动作，就作为核心直连消息保留。
  const enzoCity = ENZO.test(value)
    && MAN_CITY.test(value)
    && /(?:transfer|move|join|sign|deal|bid|offer|talks|negotiat|agree|interest|target|leave|sell|报价|谈判|加盟|转会|出售|离队)/i.test(value);
  if (enzoCity) return 'enzo_city';

  if (
    !CHELSEA.test(value)
    || OUTGOING.test(value)
  ) {
    return null;
  }
  if (CHELSEA_FIRST.test(value) || CHELSEA_DESTINATION.test(value) || TO_CHELSEA_DEAL.test(value)) {
    return 'chelsea_incoming';
  }
  return null;
}

export function isChelseaWatchItem(text) {
  return Boolean(classifyChelseaWatch(text));
}
