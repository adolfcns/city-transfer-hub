// 蓝桥中场雷达：科内转会优先，其余只收切尔西中场引援及恩佐加盟曼城的直接消息。
// 规则刻意独立于曼城主消息流，避免把切尔西比赛、伤病和普通离队混入首页。
const normalize = (value) => String(value || '')
  .toLowerCase()
  .replace(/https?:\/\/\S+/g, '')
  .replace(/[’‘]/g, "'")
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .replace(/\s+/g, ' ')
  .trim();

const CHELSEA = /(?:\bchelsea(?:\s+fc)?\b|\bcfc\b|stamford bridge|切尔西|車路士)/i;
const ENZO = /(?:\benzo(?!\s+maresca)\b(?:\s+fernandez)?|恩佐(?![·・\s]?马雷斯卡)(?:·费尔南德斯)?)/i;
const MAN_CITY = /(?:\bmanchester city\b|\bman city\b|\bmcfc\b|曼城)/i;
const LAMINE_CAMARA = /(?:\blamine\s+camara\b|拉明[·・\s]?(?:卡马拉|卡馬拉)|\bmonaco(?:'s)?\s+(?:midfielder\s+)?camara\b|摩纳哥(?:中场)?(?:的)?卡马拉)/i;
const MANU_KONE = /(?:\b(?:manu|emmanuel|kouadio)\s+kone\b|马努[·・\s]?科内|(?:\broma\b.{0,55}\bkone\b|\bkone\b.{0,55}\broma\b)|罗马.{0,15}科内)/i;
const TARGET_TRANSFER = /(?:\b(?:transfer\w*|bid\w*|offer\w*|talks|negotiat\w*|agreement|deal|interest\w*|target\w*|contact\w*|sign(?:s|ed|ing)?|join\w*|move|here we go|approach\w*|enquir\w*|medical|personal terms|accord\w*|offre\w*|transfert\w*|priorit\w*|piste|dement\w*|mercato|trattativ\w*|offert\w*|cessione|ceder\w*|vend\w*|recrut\w*)\b|报价|谈判|接触|加盟|转会|协议|辟谣|有意|目标|签下|引进|签约)/i;
const MIDFIELD_ROLE = /\bmidfield\w*\b|\bcentrocampist\w*\b|\bmilieu(?:x)?\b|中场|中場|后腰|後腰|前腰/;
// 姓名仅辅助识别中场位置，不代表这些球员正在谈判；仍必须有切尔西与转会动作。
const OTHER_MIDFIELDERS = /\balex scott\b|\badam wharton\b|\b(?:morgan )?gibbs[ -]white\b|\bjordan henderson\b|\bgranit xhaka\b|\beduardo camavinga\b|\bzub[ia]mendi\b|阿历克斯[·・\s]?斯科特|亚历克斯[·・\s]?斯科特|亚当[·・\s]?沃顿|吉布斯[·・\s-]?怀特|乔丹[·・\s]?亨德森|扎卡|卡马文加|祖比门迪|苏比门迪/;
const KONE_STANCE = /(?:\b(?:keep|stay|remain|retain|sell|sale|price|valuation|release clause|garder|rester|retenir|vendre|prix|resta|restare|trattenere|incedibile)\b|留队|留人|不会放|不放人|拒售|非卖品|要价|标价|身价)/;

// 中场检索与科内英/法/意消息并行；共用可信域名白名单和内容过滤。
export const CHELSEA_WATCH_QUERIES = [
  { key: 'watch_chelsea_incoming', name: 'Chelsea midfield watch', name_zh: '蓝桥中场雷达', query: 'Chelsea (midfielder OR midfield OR "Enzo replacement") when:7d' },
  { key: 'watch_chelsea_camara', name: 'Lamine Camara Chelsea watch', name_zh: '蓝桥重点·卡马拉', query: '"Lamine Camara" Chelsea when:7d' },
  { key: 'watch_chelsea_kone', name: 'Manu Kone transfer watch', name_zh: '首要重点·科内', query: '"Manu Kone" (Chelsea OR Roma) when:7d' },
  { key: 'watch_chelsea_kone_fr', name: 'Manu Kone French reports', name_zh: '科内·法国消息', query: '"Manu Koné" (Chelsea OR Roma) when:3d', locale: 'fr' },
  { key: 'watch_chelsea_kone_it', name: 'Manu Kone Italian reports', name_zh: '科内·意大利消息', query: '"Manu Koné" (Chelsea OR Roma) when:3d', locale: 'it' },
];
const WOMEN_OR_HISTORY = /(?:chelsea women|women's team|women’s team|\bwsl\b|女足|#onthisday|on this day|#otd)/i;
const EXCLUDED_PLAYERS = /(?:\bemiliano\s+martinez\b|\bemi\s+martinez\b|\bdibu\s+martinez\b|埃米利亚诺[·・\s]?马丁内斯|埃米[·・\s]?马丁内斯|大马丁)/i;
const CONTRACT_ONLY = /(?:new contract|contract extension|renew(?:al|ed|s|ing)?|续约)/i;
const SPECULATION_ONLY = /(?:does|should|could|can|will)\s+.{0,85}(?:need|make|complete)\s+.{0,35}(?:signing|transfer)/i;
const COMMERCIAL_OR_ROUNDUP = /(?:sponsor(?:ship)?|commercial partner|front-of-shirt|financial platform|paper talk)/i;
const OPINION_ONLY = /my column|tactical analysis|tactics analysis|football case for selling|球评|战术分析/i;
const OUTGOING = new RegExp(
  [
    String.raw`(?:leave|leaves|leaving|left|depart(?:ure|s|ed|ing)?|exit(?:s|ed|ing)?|move(?:s|d|ing)? away from|moving from|sold by|sale by|from)\s+(?:chelsea|#?cfc)`,
    String.raw`(?:chelsea|#?cfc).{0,90}(?:sell|sold|selling|sale|loan out|send on loan|accept(?:ed|s|ing)?\s+(?:a\s+)?bid.{0,30}(?:for|from)|let.{0,25}leave|departure|exit)`,
    String.raw`(?:sale|transfer|move)\s+from\s+(?:chelsea|#?cfc)`,
    String.raw`(?:agreement|deal)\s+with\s+(?:chelsea|#?cfc)\s+to\s+sign`,
    String.raw`sign(?:ing)?\s+(?:chelsea|#?cfc)(?:'s)?\s+(?:midfielder|player|star|defender|winger|striker)`,
    String.raw`(?:chelsea|#?cfc)(?:'s)?\s+.{0,55}(?:joins?|joining|move\s+to|loan\s+to)\s+(?!chelsea\b|#?cfc\b)`,
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
    || OPINION_ONLY.test(value)
  ) return null;

  // 只要同时明确提到恩佐、曼城和转会动作，就作为核心直连消息保留。
  const enzoCity = ENZO.test(value)
    && MAN_CITY.test(value)
    && (CHELSEA.test(value) || /\benzo fernandez\b|恩佐[·・\s]?费尔南德斯/.test(value))
    && /(?:\b(?:transfer\w*|move|join\w*|sign(?:s|ed|ing)?|deal|bid\w*|offer\w*|talks|negotiat\w*|agree\w*|interest\w*|target\w*|leave|sell)\b|报价|谈判|加盟|转会|出售|离队)/i.test(value);
  if (enzoCity) return 'enzo_city';

  // 罗马方面的拒售、要价、留队态度也影响科内交易，不要求每条都重复写 Chelsea。
  if (MANU_KONE.test(value) && !/\b(?:leave|leaving|from) chelsea\b|离开切尔西/.test(value)
    && (TARGET_TRANSFER.test(value) || KONE_STANCE.test(value))) return 'kone_transfer';

  if (
    !CHELSEA.test(value)
    || OUTGOING.test(value)
  ) {
    return null;
  }
  if (!MIDFIELD_ROLE.test(value) && !LAMINE_CAMARA.test(value) && !OTHER_MIDFIELDERS.test(value)) return null;
  if (!TARGET_TRANSFER.test(value)) return null;
  // 重点球员也收录“尚无协议/未报价”等澄清，不能只收到交易推进的报道。
  const targetUpdate = (LAMINE_CAMARA.test(value) || OTHER_MIDFIELDERS.test(value)) && TARGET_TRANSFER.test(value);
  if (targetUpdate || CHELSEA_FIRST.test(value) || CHELSEA_DESTINATION.test(value) || TO_CHELSEA_DEAL.test(value)
    || (MIDFIELD_ROLE.test(value) && TARGET_TRANSFER.test(value))) {
    return 'chelsea_incoming';
  }
  return null;
}

export function isChelseaWatchItem(text) {
  return Boolean(classifyChelseaWatch(text));
}

export function isChelseaCamaraFocus(text) {
  const value = normalize(text);
  // 不能仅凭“卡马拉”同名或恩佐转会就加重点，仍需通过原有转会相关性过滤。
  return CHELSEA.test(value) && LAMINE_CAMARA.test(value) && isChelseaWatchItem(value);
}

export function isChelseaKoneFocus(text) {
  const value = normalize(text);
  return MANU_KONE.test(value) && isChelseaWatchItem(value);
}

export function prioritizeChelseaWatchItems(items) {
  // 新旧记录都重新打标；只作用于雷达，不改变普通曼城消息流的时间排序。
  return items.map((item) => {
    const targets = [];
    if (isChelseaKoneFocus(item.text)) targets.push('manu_kone');
    if (isChelseaCamaraFocus(item.text)) targets.push('lamine_camara');
    const value = normalize(item.text);
    const watchType = classifyChelseaWatch(value);
    const midfield = watchType === 'chelsea_incoming' || (Boolean(watchType) && CHELSEA.test(value)
      && (LAMINE_CAMARA.test(value) || OTHER_MIDFIELDERS.test(value)
        || /\bmidfield (?:options|targets|reinforcements)\b|引进.{0,12}中场|中场引援/.test(value)));
    return { ...item, watch_type: watchType, watch_midfield: midfield, watch_targets: targets, watch_focus: targets[0] || null };
  }).sort((a, b) => (
    Number(b.watch_focus === 'manu_kone') - Number(a.watch_focus === 'manu_kone')
    || (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0)
  ));
}
