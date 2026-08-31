/* 曼城转会情报站 - 前端逻辑（无框架，纯静态） */
'use strict';

// ---------------- 配置 ----------------
const DATA_URL = './data/items-latest.json';
const DATA_FALLBACK_URL = './data/items.json';
const STATUS_URL = './data/status.json';
const CHELSEA_WATCH_URL = './data/chelsea-watch.json';
const REFRESH_MS = 90 * 1000;
// 转会窗关闭时间（到点自动切到下一个）
const WINDOWS = [
  { label: '夏窗关闭', ts: Date.parse('2026-09-01T22:00:00Z') },
  { label: '冬窗关闭', ts: Date.parse('2027-02-02T22:00:00Z') },
];
const TIER_CLASS = { T0: 't0', T1: 't1', T2: 't2', ITK: 'itk' };
const BADGE_ZH = {
  HERE_WE_GO: 'HERE WE GO!',
  OFFICIAL: '官宣',
  EXCLUSIVE: '独家',
  MEDICAL: '体检',
  BID: '报价',
  AGREEMENT: '达成协议',
  PERSONAL_TERMS: '个人条款',
  DONE_DEAL: '完成交易',
  YOUTH: '青训',
};
const LIBRARY_KEY = 'cth_library_v1';
const PRAYER_KEY = 'cth_city_prayer_v1';
const PRAYER_GOAL_START = 1500;
const PRAYER_GOAL_STEP = 500;
const ITEM_REACTIONS_KEY = 'cth_item_reactions_v1';
const PLAYER_FOLLOWS_KEY = 'cth_player_follows_v1';
const COMMENT_PROFILE_KEY = 'cth_comment_profile_v1';
const SURVEY_PROFILE_KEY = 'cth_survey_profile_v1';
const SHARE_ATTRIBUTION_KEY = 'departure_poll_share';
const COACH_SURVEY_ID = 'maresca_league_debut_2026';
const DEPARTURE_SURVEY_ID = 'summer_departure_heartbreak_2026';
const SURVEY_POPUP_ID = DEPARTURE_SURVEY_ID;
const SURVEY_INVITE_KEY = 'cth_summer_departure_heartbreak_20260825_12h_v1';
const SURVEY_INVITE_INTERVAL_MS = 12 * 60 * 60 * 1000;
const SURVEY_INVITE_DELAY_MS = 1500;
const SCOUT_REPORT_POPUP_ID = 'allan_scouting_report_2026';
const SCOUT_REPORT_INVITE_KEY = 'cth_allan_scout_report_20260822_daily_v1';
const SCOUT_REPORT_INVITE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SCOUT_REPORT_INVITE_DELAY_MS = 6500;
const RECOVERY_NOTICE_KEY = 'cth_recovery_notice_20260807';
// 布阿迪交易已进入 Here we go 阶段，暂时撤下重点传闻卡片；保留数据与逻辑，方便后续恢复。
const FOCUS_RUMOR_STRIP_ENABLED = false;
const FOCUS_SURVEY_ORDER = Object.freeze([
  COACH_SURVEY_ID,
  'allan_scouting_report_2026',
  'summer_2026',
  'loan_watch_preview_2026',
  'site_experience_2026',
]);
const REACTION_SNAPSHOT_URL = './data/reactions.json';
const REACTION_DEFS = Object.freeze([
  // 保留 fire 键以延续已有全站计数，仅更新前台展示语义。
  { key: 'fire', emoji: '🙅', label: '你不要过来啊' },
  { key: 'heart', emoji: '💙', label: '速度入城' },
  { key: 'watch', emoji: '👀', label: '再探！再报！' },
  { key: 'wild', emoji: '😂', label: '什么鬼' },
  { key: 'doubt', emoji: '🤨', label: '不可能！绝对不可能！' },
]);
const REACTION_KEYS = new Set(REACTION_DEFS.map((item) => item.key));
const SURVEY_DEFINITIONS = Object.freeze({
  summer_departure_heartbreak_2026: {
    icon: '💔',
    title: '夏窗收尾｜谁最让你意难平？',
    introHeadline: '这个夏天，曼城送走了太多熟悉的面孔。',
    intro: '',
    returningIntro: '意难平榜单有变化，回来看看谁最让蓝月球迷舍不得。',
    primaryLabel: '选出我的意难平',
    submitLabel: '提交选择，查看实时结果',
    resultsLabel: '先看蓝月球迷怎么选',
    openOnForm: true,
    closesAt: WINDOWS[0].ts,
    questions: [
      {
        id: 'departures',
        title: '哪三笔离队最让你难以接受？',
        hint: '最多选择 3 人 · 提交后仍可修改',
        type: 'multi',
        max: 3,
        options: [
          { value: 'rodri', label: '罗德里 → 巴塞罗那', description: '伊斯坦布尔一脚定江山，蓝月的定海神针。' },
          { value: 'bernardo', label: '贝尔纳多·席尔瓦 → 皇家马德里', description: '九年不知疲倦地奔跑，离开时仍满身蓝血。' },
          { value: 'stones', label: '约翰·斯通斯 → 国际米兰', description: '从后防走到中场，石头永远是三冠王的英雄。' },
          { value: 'savinho', label: '萨维尼奥 → 托特纳姆热刺', description: '天赋才刚开始兑现，最好的年华却留给了对手。' },
          { value: 'marmoush', label: '马尔穆什 → 托特纳姆热刺', description: '机会不多却屡次回应，还没看够，他就走了。' },
          { value: 'nico_gonzalez', label: '尼科·冈萨雷斯 → 纽卡斯尔联', description: '任劳任怨、甘愿替补，直到最后仍一心想留下。' },
          { value: 'reijnders', label: '蒂贾尼·赖因德斯 → 卡迪西亚', description: '匆匆一个赛季，还没真正看清他的上限。' },
          { value: 'trafford', label: '詹姆斯·特拉福德 → 利兹联', description: '好不容易回到家，未来却再次留给了别人。' },
          { value: 'ake', label: '纳坦·阿克 → 费内巴切', description: '哪里需要就站在哪里，从不抱怨，从不退缩。' },
          { value: 'akanji', label: '曼努埃尔·阿坎吉 → 国际米兰', description: '默默补遍整条防线，可靠到让人习以为常。' },
        ],
      },
    ],
  },
  allan_scouting_report_2026: {
    entry: '🔍 阿兰球探报告',
    icon: '🔍',
    title: '阿兰球探报告',
    introHeadline: '数据不炸裂，曼城为什么还想要他？',
    intro: '把 Allan 放进五大联赛 21—23 岁同位置球员中比较：突破强度和效率均居首，但禁区参与与预期产量仍然偏低。4 张图，看懂曼城究竟在赌什么。',
    reportOnly: true,
    primaryLabel: '查看完整球探报告',
    introHighlights: [
      { value: '第 1', label: '成功过人 /90' },
      { value: '第 1', label: '过人成功率' },
      { value: '第 6', label: '禁区触球 /90' },
    ],
    reportImages: [
      { src: './assets/allan-report/01-overview.png', title: '1. 六项关键进攻指标总览', caption: 'Allan 的突破能力达到组内上游，但整体进攻画像仍然偏科。' },
      { src: './assets/allan-report/02-dribbling.png', title: '2. 曼城看中的一对一能力', caption: '成功过人次数和过人成功率同时位列可比组第一。' },
      { src: './assets/allan-report/03-output-gap.png', title: '3. 实际产量与底层数据差距', caption: '实际 G+A 不差，但 xG+xA 偏低，说明稳定产量仍有待证明。' },
      { src: './assets/allan-report/04-role-map.png', title: '4. Allan 的真实角色定位', caption: '他更像外围持球破局的推进爆点，而非高频占据禁区的进攻核心。' },
    ],
  },
  loan_watch_preview_2026: {
    entry: '🌍 蓝月在外',
    icon: '🌍',
    title: '蓝月在外 · 新功能预告',
    introHeadline: '他们离开曼城，不等于离开视线',
    intro: '新赛季开始后，本站将追踪所有曼城外租球员（含 U21），以及今夏转会、离队球员的每场表现。',
    announcementOnly: true,
    previewItems: ['⭐ 专业评分 7.4', '⏱ 出场 82 分钟', '⚽ 进球 1', '🅰️ 助攻 1'],
    previewNote: '以上为展示示例 · 实际数据将在每场赛后更新',
    reservationFeature: 'loan_watch_2026',
    reservationBase: 120,
    primaryLabel: '预约关注',
    reservedLabel: '✓ 已预约',
  },
  maresca_league_debut_2026: {
    entry: '⚖️ 英超首秀评分',
    icon: '⚖️',
    title: '马雷斯卡英超首秀评分',
    introHeadline: '马雷斯卡英超首考：这份答卷你打几分？',
    intro: '首场英超踢完，这套“战术科研”到底有没有东西？花 30 秒打分，看看蓝月球迷怎么判。',
    returningIntro: '英超首秀评分有变化，回来看看蓝月球迷的最新判断。',
    primaryLabel: '给马雷斯卡打分',
    submitLabel: '提交评分，查看实时结果',
    resultsLabel: '先看球迷怎么评',
    openOnForm: true,
    closesAt: null,
    questions: [
      {
        id: 'score',
        title: '1. 马雷斯卡的首场英超答卷，你给几分？',
        hint: '0～2 科研失败 · 3～4 问题不少 · 5～6 勉强及格 · 7～8 值得期待 · 9～10 一声马来，重回陆地 GOAT 之境',
        type: 'number',
        options: Array.from({ length: 11 }, (_, value) => ({ value: String(value), label: String(value) })),
      },
      { id: 'adjustments', title: '2. 你认为本场胜利与马雷斯卡的临场调整有关吗？', type: 'single', options: [
        { value: 'decisive', label: '关系很大，调整直接改变了比赛' },
        { value: 'some', label: '有一定关系，但主要还是球员发挥' },
        { value: 'little', label: '关系不大，基本靠阵容实力拿下' },
        { value: 'none', label: '完全无关，又觉得自己行了' },
      ] },
      { id: 'tactics', title: '3. 你对本场的“战术科研”满意吗？', type: 'single', options: [
        { value: 'very', label: '非常满意，新体系已经有模有样' },
        { value: 'direction', label: '方向不错，但还需要继续磨合' },
        { value: 'average', label: '想法很多，实际效果比较一般' },
        { value: 'confused', label: '完全不满意，根本看不懂在研究什么' },
      ] },
      { id: 'concerns', title: '4. 目前这支曼城最让你担心什么？', hint: '最多选择两个', type: 'multi', max: 2, options: [
        { value: 'attack', label: '进攻套路太单一' },
        { value: 'midfield', label: '中场控制力不足' },
        { value: 'transition', label: '防守转换容易被打穿' },
        { value: 'roles', label: '球员位置和使用方式奇怪' },
        { value: 'subs', label: '临场换人过于保守' },
        { value: 'cohesion', label: '新援与原有体系尚未磨合' },
        { value: 'stable_614', label: '刘神稳定出场、禁区争顶、冒充球王' },
      ] },
      { id: 'outlook', title: '5. 你看好马雷斯卡治下的曼城前景吗？', type: 'single', options: [
        { value: 'very', label: '非常看好，有机会开创新时代' },
        { value: 'cautious', label: '谨慎看好，磨合后会越来越好' },
        { value: 'wait', label: '暂时观望，再看几轮联赛' },
        { value: 'low', label: '不太看好，迟早科研翻车' },
        { value: 'no', label: '完全不看好，好日子还在后头呢' },
      ] },
    ],
  },
  summer_2026: {
    entry: '📊 夏窗调查',
    icon: '🔥',
    title: '夏窗调查',
    introHeadline: '恭喜维亚纳带领曼城获得26/27赛季销售冠军！',
    introEmphasis: '销售',
    introQuestion: '泥城究竟该何去何从？',
    intro: '会压哨补强，还是就这样结束？',
    returningIntro: '投票结果有变化，回来看看风向？',
    primaryLabel: '花30秒给夏窗打分',
    resultsLabel: '看看大家怎么选',
    closesAt: WINDOWS[0].ts,
    questions: [
      {
        id: 'score',
        title: '1. 给曼城目前的夏窗打几分？',
        hint: '0～2 维亚纳睡着了 · 3～4 赶紧买人 · 5～6 勉强及格 · 7～8 有点东西 · 9～10 维圣封神',
        type: 'number',
        options: Array.from({ length: 11 }, (_, value) => ({ value: String(value), label: `${value} 分` })),
      },
      { id: 'positions', title: '2. 窗口还剩 XX 天，最亟需补强哪个位置？', hint: '最多选择两个', type: 'multi', max: 2, exclusive: 'none', options: [
        { value: 'cb', label: '中后卫' }, { value: 'fb', label: '边后卫' }, { value: 'dm', label: '防守型中场' },
        { value: 'cm', label: '组织型中场' }, { value: 'winger', label: '边锋' }, { value: 'striker', label: '中锋' },
        { value: 'none', label: '不需要再买' },
      ] },
      { id: 'arrivals', title: '3. 你认为关窗前还会来几名新援？', type: 'single', options: [
        { value: '0', label: '0 人，别等了' }, { value: '1', label: '1 人，至少来一个' },
        { value: '2', label: '2 人，正常发挥' }, { value: '3plus', label: '3 人以上，买买买' },
      ] },
      { id: 'strategy', title: '4. 接下来最应该采用哪种引援策略？', type: 'single', options: [
        { value: 'ready', label: '直接购买即战力' }, { value: 'youth', label: '押注年轻潜力股' },
        { value: 'loan', label: '租借过渡' }, { value: 'sell_first', label: '先卖人再买人' },
        { value: 'no_panic', label: '宁缺毋滥，别恐慌购物' },
      ] },
      { id: 'satisfaction', title: '5. 这个夏窗最让你满意的是什么？', type: 'single', options: [
        { value: 'quality', label: '新援质量' }, { value: 'speed', label: '下手速度' },
        { value: 'youth', label: '年轻化方向' }, { value: 'sales', label: '清理冗员' },
        { value: 'spend', label: '控制转会费' }, { value: 'none', label: '暂时没有满意的' },
      ] },
      { id: 'unacceptable', title: '6. 你最不能接受哪种关窗结局？', type: 'single', options: [
        { value: 'gap', label: '关键位置一个没补' }, { value: 'panic', label: '最后一天恐慌购物' },
        { value: 'overpay', label: '为普通球员严重溢价' }, { value: 'core_exit', label: '核心球员突然离队' },
        { value: 'empty_rumors', label: '绯闻看了一个月，最后一个没来' }, { value: 'next_window', label: '又开始“下个窗口再说”' },
      ] },
      { id: 'confidence', title: '7. 你对维亚纳完成剩余任务有多大信心？', type: 'single', options: [
        { value: 'none', label: '完全不信' }, { value: 'low', label: '有点悬' }, { value: 'half', label: '五五开' },
        { value: 'high', label: '比较有信心' }, { value: 'saint', label: '我信维圣' },
      ] },
      { id: 'era', title: '8. 你是哪一代蓝月球迷？', hint: '选填，用于比较不同阶段球迷的看法', optional: true, type: 'single', options: [
        { value: 'sun_jihai', label: '孙继海时期' }, { value: 'takeover', label: '阿布扎比入主后' },
        { value: 'aguero', label: '93:20 时期' }, { value: 'pep', label: '瓜迪奥拉时期' },
        { value: 'haaland', label: '哈兰德时期' }, { value: 'new', label: '刚入坑的新蓝月' },
      ] },
    ],
  },
  site_experience_2026: {
    entry: '💬 本站体验',
    title: '这网站下一步先改什么？你说了算',
    intro: '加载速度、翻译、排版还是新功能？花 30 秒给站长指条路，票数最高的问题优先优化。',
    returningIntro: '投票结果有变化，回来看看风向？',
    primaryLabel: '我要提意见',
    resultsLabel: '查看大家的选择',
    closesAt: null,
    questions: [
      { id: 'rating', title: '1. 你给本站整体体验打几分？', type: 'number', options: [1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value} 颗蓝心` })) },
      { id: 'favorites', title: '2. 你最喜欢哪两个功能？', hint: '最多选择两个', type: 'multi', max: 2, options: [
        { value: 'chinese', label: '中文聚合' }, { value: 'bilingual', label: '双语对照' }, { value: 'tiers', label: '信源分级' },
        { value: 'focus', label: '重点传闻' }, { value: 'follow', label: '球员关注' }, { value: 'comments', label: '评论与点赞' },
        { value: 'reactions', label: '表情投票' }, { value: 'share', label: '分享图片' }, { value: 'filters', label: '搜索和信源筛选' },
      ] },
      { id: 'improvements', title: '3. 本站目前最需要改进什么？', hint: '最多选择两个', type: 'multi', max: 2, options: [
        { value: 'freshness', label: '更新速度' }, { value: 'translation', label: '翻译准确度' }, { value: 'sources', label: '信源丰富度' },
        { value: 'duplicates', label: '重复消息太多' }, { value: 'mobile_space', label: '手机页面占用空间大' },
        { value: 'readability', label: '字号与阅读体验' }, { value: 'filters', label: '搜索和筛选' },
        { value: 'comments', label: '评论互动' }, { value: 'performance', label: '页面加载速度' },
      ] },
      { id: 'density', title: '4. 你觉得目前的信息密度怎么样？', type: 'single', options: [
        { value: 'too_dense', label: '太密了，看着累' }, { value: 'right', label: '刚刚好' },
        { value: 'more_compact', label: '还可以更紧凑' }, { value: 'too_little', label: '信息太少，希望多一些' },
      ] },
      { id: 'next_feature', title: '5. 你最希望下一个增加什么功能？', type: 'single', options: [
        { value: 'follow_alerts', label: '关注球员并接收提醒' }, { value: 'timeline', label: '转会传闻进度时间线' },
        { value: 'daily_digest', label: '每日曼城转会摘要' }, { value: 'custom_sources', label: '自定义关注信源' },
        { value: 'breaking_push', label: '重大消息通知' }, { value: 'more_polls', label: '更多投票和球迷调查' },
      ] },
      { id: 'sharing', title: '6. 你愿意把本站分享给其他曼城球迷吗？', type: 'single', options: [
        { value: 'already', label: '已经分享过' }, { value: 'breaking_only', label: '有重大消息时会分享' },
        { value: 'better_first', label: '体验再好一点会分享' }, { value: 'not_now', label: '暂时不会' },
      ] },
    ],
  },
});
const FEED_BATCH_SIZE = 24;
const PINNED_RUMOR_LIMIT = 30;
const PINNED_INITIAL_SIZE = 6;
const PINNED_BATCH_SIZE = 6;
const SEARCH_DEBOUNCE_MS = 140;
const NICKNAME_CHANGE_MS = 7 * 24 * 60 * 60 * 1000;
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

// ---------------- 状态 ----------------
const state = {
  items: [],
  totalItems: 0,
  archiveFiles: [],
  loadedArchiveFiles: new Set(),
  archiveLoading: false,
  generatedAt: null,
  twitterEnabled: null,
  isDemo: false,
  status: null,
  sourceCatalog: [],
  focusTargets: [],
  focusTargetKey: '',
  chelseaWatchItems: [],
  chelseaWatchGeneratedAt: null,
  chelseaWatchLoaded: false,
  chelseaWatchOpen: false,
  seenIds: new Set(),
  newIds: new Set(),
  pendingNew: 0,
  library: loadLibrary(),
  playerFollows: loadPlayerFollows(),
  reactionCounts: {},
  reactionPrefs: loadReactionPrefs(),
  reactionEndpoint: null,
  commentCounts: {},
  commentProfile: loadCommentProfile(),
  commentEndpoint: null,
  surveyProfile: loadSurveyProfile(),
  surveyEndpoint: null,
  featureReservationEndpoint: null,
  shareEventEndpoint: null,
  filters: loadFilters(),
};
let feedItems = [];
let feedCursor = 0;
let feedLastDay = null;
let feedObserver = null;
let feedAppending = false;
let feedGeneration = 0;
let searchRenderTimer = null;
let engagementObserver = null;
const engagementItems = new WeakMap();
const reactionLiveLoaded = new Set();
const reactionReadQueue = new Set();
const reactionInFlight = new Set();
let reactionReadTimer = null;
let reactionSnapshotLoaded = false;
let reactionPendingFlush = false;
const commentLiveLoaded = new Set();
const commentReadQueue = new Set();
let commentReadTimer = null;
let activeCommentItem = null;
let activeReplyTarget = null;
let commentRequestInFlight = false;
let shareCardInFlight = false;
let sharedMessageRevealed = false;

function loadFilters() {
  const def = { sources: null, search: '', lang: 'zh', libraryView: 'all' };
  try {
    const saved = JSON.parse(localStorage.getItem('cth_filters') || 'null');
    if (!saved || typeof saved !== 'object') return def;
    return {
      sources: Array.isArray(saved.sources) ? saved.sources.map(String) : null,
      search: '',
      lang: ['zh', 'both', 'en'].includes(saved.lang) ? saved.lang : 'zh',
      libraryView: ['all', 'unread', 'favorites'].includes(saved.libraryView) ? saved.libraryView : 'all',
    };
  } catch { return def; }
}
function saveFilters() {
  const { sources, lang, libraryView } = state.filters;
  localStorage.setItem('cth_filters', JSON.stringify({ sources, lang, libraryView }));
}
function loadLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(LIBRARY_KEY) || 'null');
    return {
      favorites: new Set(Array.isArray(saved?.favorites) ? saved.favorites.map(String) : []),
      read: new Set(Array.isArray(saved?.read) ? saved.read.map(String) : []),
      hiddenPinned: new Set(Array.isArray(saved?.hiddenPinned) ? saved.hiddenPinned.map(String).slice(-2000) : []),
    };
  } catch {
    return { favorites: new Set(), read: new Set(), hiddenPinned: new Set() };
  }
}
function saveLibrary() {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify({
      favorites: [...state.library.favorites],
      read: [...state.library.read],
      hiddenPinned: [...state.library.hiddenPinned].slice(-2000),
    }));
  } catch { /* 浏览器禁用本机存储时，本次访问内仍可使用 */ }
}

function loadPlayerFollows() {
  try {
    const saved = JSON.parse(localStorage.getItem(PLAYER_FOLLOWS_KEY) || '[]');
    return new Set(Array.isArray(saved) ? saved.map(String).filter(Boolean).slice(-100) : []);
  } catch { return new Set(); }
}

function savePlayerFollows() {
  try { localStorage.setItem(PLAYER_FOLLOWS_KEY, JSON.stringify([...state.playerFollows].slice(-100))); }
  catch { /* 浏览器禁用本机存储时，本次访问内仍可继续关注 */ }
}

function loadCommentProfile() {
  const empty = { voter: newAnonymousVoterId(), nickname: '', nicknameUpdatedAt: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(COMMENT_PROFILE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return empty;
    return {
      voter: /^[A-Za-z0-9_-]{12,80}$/.test(String(saved.voter || '')) ? String(saved.voter) : empty.voter,
      nickname: String(saved.nickname || '').slice(0, 40),
      nicknameUpdatedAt: Math.max(0, Number(saved.nicknameUpdatedAt || 0)),
    };
  } catch { return empty; }
}

function saveCommentProfile() {
  try { localStorage.setItem(COMMENT_PROFILE_KEY, JSON.stringify(state.commentProfile)); }
  catch { /* 浏览器禁用本机存储时，本次访问内仍可评论 */ }
}

function loadSurveyProfile() {
  const empty = { voter: newAnonymousVoterId() };
  try {
    const saved = JSON.parse(localStorage.getItem(SURVEY_PROFILE_KEY) || 'null');
    const voter = /^[A-Za-z0-9_-]{12,80}$/.test(String(saved?.voter || '')) ? String(saved.voter) : empty.voter;
    const profile = { voter };
    localStorage.setItem(SURVEY_PROFILE_KEY, JSON.stringify(profile));
    return profile;
  } catch { return empty; }
}

function normalizeNickname(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function compactNickname(value) {
  return normalizeNickname(value).toLocaleLowerCase('zh-CN').replace(/[^\p{Script=Han}a-z0-9]/gu, '');
}

function nicknameError(value) {
  const nickname = normalizeNickname(value);
  const length = [...nickname].length;
  if (length < 2 || length > 10) return '昵称需要 2～10 个字';
  const normalized = compactNickname(nickname);
  if (!normalized || NICKNAME_BLOCKED_TERMS.some((term) => normalized.includes(compactNickname(term)))) {
    return '昵称涉及政治人物、机构或冒充身份，请换一个';
  }
  if (!/^[\p{Script=Han}A-Za-z0-9·._-]+$/u.test(nickname)) return '昵称仅支持中文、字母、数字和 · _ -';
  return '';
}

function commentBodyError(value) {
  const body = String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const length = [...body].length;
  if (length < 2 || length > 120) return '评论需要 2～120 个字';
  if (/(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|cn|net|org|io|top|xyz)\b)/i.test(body)) return '评论暂不支持网址或广告链接';
  return '';
}

function focusTargetName(target) {
  return target?.name_zh || target?.name || '该球员';
}

async function togglePlayerFollow(target) {
  const key = String(target?.key || '');
  if (!key) return;
  const name = focusTargetName(target);
  if (state.playerFollows.has(key)) {
    state.playerFollows.delete(key);
    savePlayerFollows();
    renderFocusZone();
    toast(`已取消关注 ${name}`);
    return;
  }

  state.playerFollows.add(key);
  savePlayerFollows();
  renderFocusZone();

  if (!('Notification' in window) || !window.isSecureContext) {
    toast(`已关注 ${name}；出现 T0、报价或官宣时会在站内提醒`);
    return;
  }
  if (Notification.permission === 'granted') {
    toast(`已关注 ${name}；页面在后台时也会发送系统通知`);
    return;
  }
  if (Notification.permission === 'denied') {
    toast(`已关注 ${name}；系统通知被浏览器关闭，站内提醒仍然有效`);
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    toast(permission === 'granted'
      ? `已关注 ${name}；页面在后台时也会发送系统通知`
      : `已关注 ${name}；未开启系统通知，站内提醒仍然有效`);
  } catch {
    toast(`已关注 ${name}；出现重要进展时会在站内提醒`);
  }
}

function playerAlertReason(it) {
  const badges = new Set(it.badges || []);
  const reasons = [];
  if (badges.has('OFFICIAL') || badges.has('DONE_DEAL')) reasons.push('官宣');
  if (badges.has('HERE_WE_GO')) reasons.push('HERE WE GO');
  if (badges.has('BID')) reasons.push('报价');
  if (it.tier === 'T0') reasons.push('T0');
  return [...new Set(reasons)].join(' · ');
}

function followedPlayerAlerts(items) {
  return (items || []).flatMap((it) => {
    const reason = playerAlertReason(it);
    if (!reason) return [];
    const itemFocus = new Set((it.focus || []).map(String));
    const targets = (state.focusTargets || [])
      .filter((target) => state.playerFollows.has(String(target.key)) && itemFocus.has(String(target.key)));
    if (!targets.length) return [];
    return [{ it, reason, names: targets.map(focusTargetName).join('、') }];
  });
}

function notifyFollowedPlayers(items) {
  const alerts = followedPlayerAlerts(items);
  if (!alerts.length) return;
  const first = alerts[0];
  const summary = String(first.it.text_zh || first.it.text || '有一条新的重要转会消息')
    .replace(/\s+/g, ' ').trim().slice(0, 90);
  const more = alerts.length > 1 ? `，另有 ${alerts.length - 1} 条` : '';
  const title = `🔔 ${first.names}：${first.reason}`;
  toast(`${title}｜${summary}${more}`);

  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const notice = new Notification(title, {
      body: `${summary}${more}`,
      icon: new URL('assets/man-city-crest.svg', window.location.href).href,
      tag: `cth-player-${itemId(first.it)}`,
    });
    notice.onclick = () => {
      notice.close();
      window.focus();
      const card = [...document.querySelectorAll('article[data-item-id]')]
        .find((node) => node.dataset.itemId === itemId(first.it));
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      else window.location.href = itemShareUrl(first.it);
    };
  } catch { /* 部分移动浏览器仅支持站内提醒 */ }
}

function newAnonymousVoterId() {
  try {
    if (crypto.randomUUID) return `v_${crypto.randomUUID().replace(/-/g, '')}`;
  } catch { /* 非安全上下文时使用随机兜底 */ }
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 18)}`;
}

function loadReactionPrefs() {
  const empty = { voter: newAnonymousVoterId(), votes: {}, pending: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(ITEM_REACTIONS_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return empty;
    const voter = /^[A-Za-z0-9_-]{12,80}$/.test(String(saved.voter || '')) ? String(saved.voter) : empty.voter;
    const cleanMap = (value) => Object.fromEntries(Object.entries(value || {})
      .filter(([id, reaction]) => /^[A-Za-z0-9_-]{1,128}$/.test(id) && REACTION_KEYS.has(reaction))
      .slice(-2000));
    return { voter, votes: cleanMap(saved.votes), pending: cleanMap(saved.pending) };
  } catch { return empty; }
}

function saveReactionPrefs() {
  try { localStorage.setItem(ITEM_REACTIONS_KEY, JSON.stringify(state.reactionPrefs)); } catch { /* 本次访问内仍可投票 */ }
}

function blankItemReactionCounts() {
  return Object.fromEntries(REACTION_DEFS.map(({ key }) => [key, 0]));
}

function normalizeItemReactionCounts(value) {
  const out = {};
  for (const [id, counts] of Object.entries(value || {})) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !counts || typeof counts !== 'object') continue;
    out[id] = blankItemReactionCounts();
    for (const { key } of REACTION_DEFS) {
      const n = Number(counts[key] || 0);
      out[id][key] = Number.isSafeInteger(n) && n >= 0 ? n : 0;
    }
  }
  return out;
}

function mergeItemReactionCounts(value) {
  Object.assign(state.reactionCounts, normalizeItemReactionCounts(value));
}

function itemReactionCounts(id) {
  state.reactionCounts[id] ||= blankItemReactionCounts();
  return state.reactionCounts[id];
}

function compactReactionCount(count) {
  return count > 999 ? '999+' : String(Math.max(0, count || 0));
}

function itemId(it) {
  return String(it.id || it.url);
}
function toggleFavorite(it) {
  const id = itemId(it);
  if (state.library.favorites.has(id)) state.library.favorites.delete(id);
  else state.library.favorites.add(id);
  saveLibrary();
  refreshLibraryUi(it, 'favorite');
}
function toggleRead(it) {
  const id = itemId(it);
  if (state.library.read.has(id)) state.library.read.delete(id);
  else state.library.read.add(id);
  saveLibrary();
  refreshLibraryUi(it, 'read');
}
function markRead(it) {
  const id = itemId(it);
  if (state.library.read.has(id)) return;
  state.library.read.add(id);
  saveLibrary();
  refreshLibraryUi(it, 'read');
}
function hidePinnedItem(it, card) {
  const id = itemId(it);
  state.library.read.add(id);
  state.library.hiddenPinned.add(id);
  saveLibrary();
  updateLibraryBar();
  card?.classList.add('is-hiding');
  setTimeout(() => renderFocusZone(), card ? 130 : 0);
  toast('已读并隐藏这条专区消息');
}
function restoreHiddenPinned(items) {
  const currentIds = new Set((items || []).map(itemId));
  let restored = 0;
  for (const id of [...state.library.hiddenPinned]) {
    if (!currentIds.has(id)) continue;
    state.library.hiddenPinned.delete(id);
    restored++;
  }
  if (restored === 0) return;
  saveLibrary();
  renderFocusZone();
  toast(`已恢复 ${restored} 条专区消息`);
}

function itemShareUrl(it) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('msg', itemId(it));
  return url.href;
}

function requestedMessageId() {
  try { return new URLSearchParams(window.location.search).get('msg') || ''; }
  catch { return ''; }
}

function prepareRequestedMessageView() {
  if (sharedMessageRevealed) return;
  const id = requestedMessageId();
  if (!id || !state.items.some((it) => itemId(it) === id)) return;
  state.filters.sources = null;
  state.filters.search = '';
  state.filters.libraryView = 'all';
  state.library.hiddenPinned.delete(id);
}

function revealRequestedMessage() {
  if (sharedMessageRevealed) return;
  const id = requestedMessageId();
  if (!id) return;
  const target = [...document.querySelectorAll('article[data-item-id]')]
    .find((node) => node.dataset.itemId === id);
  if (!target) return;
  sharedMessageRevealed = true;
  target.classList.add('shared-message-target');
  target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  toast('已为你定位到这条消息');
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('msg');
  window.history.replaceState(null, '', cleanUrl.href);
  setTimeout(() => target.classList.remove('shared-message-target'), 4200);
}

const SHARE_CARD_WIDTH = 1080;
const SHARE_CARD_HEIGHT = 1440;
const SURVEY_SHARE_WIDTH = 1080;
const SURVEY_SHARE_HEIGHT = 1920;
const DONGQIUDI_CARD_WIDTH = 1175;
const DONGQIUDI_CARD_HEIGHT = 1435;
const SHARE_CARD_FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
const shareCardImageCache = new Map();

function loadShareCardImage(src) {
  if (shareCardImageCache.has(src)) return shareCardImageCache.get(src);
  const pending = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`无法加载分享卡素材：${src}`));
    image.src = src;
  });
  shareCardImageCache.set(src, pending);
  return pending;
}

function roundedCanvasPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundedCanvasRect(ctx, x, y, width, height, radius, fill) {
  roundedCanvasPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function cardFont(ctx, size, weight = 600) {
  ctx.font = `${weight} ${size}px ${SHARE_CARD_FONT}`;
}

function wrapCardText(ctx, text, maxWidth, maxLines) {
  const chars = Array.from(String(text || '').replace(/\s+/g, ' ').trim());
  const lines = [];
  let line = '';
  let consumed = 0;
  for (let index = 0; index < chars.length; index++) {
    const candidate = line + chars[index];
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = chars[index];
      if (lines.length === maxLines) {
        consumed = index;
        break;
      }
    } else {
      line = candidate;
    }
    consumed = index + 1;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (consumed < chars.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

function shareCardPublishedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '发布时间未知';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date).replaceAll('/', '-');
  } catch { return date.toLocaleString('zh-CN', { hour12: false }); }
}

function shareCardTextStyle(length) {
  if (length <= 80) return { size: 48, lineHeight: 70, maxLines: 7 };
  if (length <= 150) return { size: 40, lineHeight: 60, maxLines: 8 };
  if (length <= 260) return { size: 34, lineHeight: 52, maxLines: 10 };
  return { size: 30, lineHeight: 46, maxLines: 11 };
}

async function buildSingleMessageShareCard(it) {
  const chinese = String(it.text_zh || '').trim();
  if (!chinese) throw new Error('NO_CHINESE_TEXT');
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const background = ctx.createLinearGradient(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  background.addColorStop(0, '#071d34');
  background.addColorStop(.58, '#0b2a4a');
  background.addColorStop(1, '#164c73');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  ctx.save();
  ctx.globalAlpha = .42;
  ctx.strokeStyle = '#6cabdd';
  ctx.lineWidth = 76;
  ctx.beginPath();
  ctx.arc(1015, 85, 275, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = .12;
  ctx.fillStyle = '#8dd2f2';
  ctx.beginPath();
  ctx.arc(80, 850, 280, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const assetBase = new URL('./assets/', document.baseURI).href;
  const [crest, qr] = await Promise.all([
    loadShareCardImage(`${assetBase}man-city-crest.svg`),
    loadShareCardImage(`${assetBase}site-qr.png`),
  ]);
  ctx.drawImage(crest, 72, 58, 142, 142);

  cardFont(ctx, 30, 700);
  ctx.fillStyle = '#8dd2f2';
  ctx.fillText('曼城转会情报站', 248, 96);

  cardFont(ctx, 66, 900);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('单条消息速报', 248, 170);
  cardFont(ctx, 23, 500);
  ctx.fillStyle = '#c8e7f8';
  ctx.fillText('24小时自动更新曼城转会动态 · 原文可追溯', 248, 218);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, .26)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 14;
  fillRoundedCanvasRect(ctx, 60, 286, 960, 790, 30, '#f8fcff');
  ctx.restore();

  const tierAccent = { T0: '#f2c94c', T1: '#4aa9dc', T2: '#91a2b2', ITK: '#6cabdd' }[it.tier] || '#6cabdd';
  fillRoundedCanvasRect(ctx, 60, 286, 14, 790, 7, tierAccent);
  fillRoundedCanvasRect(ctx, 102, 334, it.tier === 'ITK' ? 100 : 80, 54, 15, '#6cabdd');
  cardFont(ctx, 27, 900);
  ctx.fillStyle = '#071d34';
  ctx.textAlign = 'center';
  ctx.fillText(it.tier || 'T2', 102 + (it.tier === 'ITK' ? 50 : 40), 371);
  ctx.textAlign = 'left';

  const source = it.source_name_zh || it.source_name || '未知信源';
  cardFont(ctx, 31, 800);
  ctx.fillStyle = '#0b2a4a';
  ctx.fillText(source, 225, 371);
  cardFont(ctx, 22, 500);
  ctx.fillStyle = '#657d91';
  ctx.textAlign = 'right';
  ctx.fillText(shareCardPublishedAt(it.published_at), 966, 371);
  ctx.textAlign = 'left';
  ctx.strokeStyle = '#d4e5ef';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(102, 426);
  ctx.lineTo(966, 426);
  ctx.stroke();

  const bodyStyle = shareCardTextStyle(Array.from(chinese).length);
  cardFont(ctx, bodyStyle.size, 700);
  ctx.fillStyle = '#102f4c';
  const lines = wrapCardText(ctx, chinese, 820, bodyStyle.maxLines);
  const bodyAreaHeight = 500;
  const textBlockHeight = Math.max(bodyStyle.size, (lines.length - 1) * bodyStyle.lineHeight + bodyStyle.size);
  let textY = 500 + Math.max(0, (bodyAreaHeight - textBlockHeight) / 2);
  for (const line of lines) {
    ctx.fillText(line, 106, textY);
    textY += bodyStyle.lineHeight;
  }

  const badges = (it.badges || []).map((badge) => BADGE_ZH[badge]).filter(Boolean).slice(0, 2);
  if (badges.length) {
    let badgeX = 106;
    for (const badge of badges) {
      cardFont(ctx, 21, 800);
      const width = Math.ceil(ctx.measureText(badge).width) + 34;
      fillRoundedCanvasRect(ctx, badgeX, 992, width, 44, 13, '#dff3ff');
      ctx.fillStyle = '#0b5b88';
      ctx.fillText(badge, badgeX + 17, 1022);
      badgeX += width + 12;
    }
  }

  const footer = ctx.createLinearGradient(0, 1140, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  footer.addColorStop(0, '#8dd2f2');
  footer.addColorStop(1, '#6cabdd');
  ctx.fillStyle = footer;
  ctx.fillRect(0, 1140, SHARE_CARD_WIDTH, 300);
  cardFont(ctx, 38, 900);
  ctx.fillStyle = '#071d34';
  ctx.fillText('扫完这个码，你也是半个罗马诺', 62, 1204);
  cardFont(ctx, 23, 800);
  ctx.fillStyle = '#0b2a4a';
  ctx.fillText('完整消息及原文来源请查看曼城转会情报站', 62, 1260);
  ctx.fillText('adolfcns.github.io/city-transfer-hub/', 62, 1312);
  ctx.fillText('备用站：city-transfer-hub.pages.dev/', 62, 1364);

  fillRoundedCanvasRect(ctx, 842, 1172, 184, 184, 18, '#ffffff');
  ctx.drawImage(qr, 854, 1184, 160, 160);
  cardFont(ctx, 17, 800);
  ctx.fillStyle = '#0b2a4a';
  ctx.textAlign = 'center';
  ctx.fillText('您的分享，', 934, 1382);
  ctx.fillText('是我继续更新的动力', 934, 1408);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG_EXPORT_FAILED')), 'image/png', .96);
  });
}

function dongqiudiCleanText(value) {
  return String(value || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\bwww\.\S+/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

function dongqiudiHandle(it) {
  const match = String(it.url || '').match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)/i);
  if (!match) return `${it.tier || 'T2'} 信源`;
  try { return `@${decodeURIComponent(match[1])}`; } catch { return `@${match[1]}`; }
}

function dongqiudiPublishedAt(value, tier = 'T2') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '发布时间未知';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Shanghai', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date);
    const part = (type) => parts.find((item) => item.type === type)?.value || '';
    return `${part('hour')}:${part('minute')} · ${part('day')}/${part('month')}/${part('year')} · ${tier}信源`;
  } catch { return shareCardPublishedAt(value); }
}

function fitCanvasText(ctx, text, maxWidth) {
  const chars = Array.from(String(text || ''));
  if (ctx.measureText(chars.join('')).width <= maxWidth) return chars.join('');
  while (chars.length && ctx.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop();
  return `${chars.join('')}…`;
}

function dongqiudiStyledGlyphs(text) {
  const tokens = String(text || '').split(/([#@][\p{L}\p{N}_·-]+)/gu);
  const glyphs = [];
  for (const token of tokens) {
    const color = /^[#@]/u.test(token) ? '#1d9bf0' : '#e7e9ea';
    for (const char of Array.from(token)) glyphs.push({ char, color });
  }
  return glyphs;
}

function wrapDongqiudiText(ctx, text, maxWidth, maxLines) {
  const lines = [[]];
  let truncated = false;
  for (const glyph of dongqiudiStyledGlyphs(text)) {
    if (glyph.char === '\n') {
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
      lines.push([]);
      continue;
    }
    const line = lines[lines.length - 1];
    const lineWidth = line.reduce((sum, item) => sum + item.width, 0);
    const width = ctx.measureText(glyph.char).width;
    if (line.length && lineWidth + width > maxWidth) {
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
      lines.push([]);
    }
    const activeLine = lines[lines.length - 1];
    if (activeLine.length === 0 && /^\s$/u.test(glyph.char)) continue;
    activeLine.push({ ...glyph, width });
  }
  if (truncated && lines.length) {
    const line = lines[lines.length - 1];
    const ellipsisWidth = ctx.measureText('…').width;
    while (line.length && line.reduce((sum, item) => sum + item.width, 0) + ellipsisWidth > maxWidth) line.pop();
    line.push({ char: '…', color: '#e7e9ea', width: ellipsisWidth });
  }
  return lines.filter((line) => line.length);
}

function drawDongqiudiLines(ctx, lines, x, y, lineHeight) {
  let lineY = y;
  for (const line of lines) {
    let lineX = x;
    for (const glyph of line) {
      ctx.fillStyle = glyph.color;
      ctx.fillText(glyph.char, lineX, lineY);
      lineX += glyph.width;
    }
    lineY += lineHeight;
  }
  return lineY;
}

function drawDongqiudiAvatar(ctx, it, x, y, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = `hsl(${hueOf(it.source_key || it.source_name)}, 46%, 36%)`;
  ctx.fill();
  ctx.strokeStyle = '#3d3d3d';
  ctx.lineWidth = 2;
  ctx.stroke();
  cardFont(ctx, radius * .72, 800);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initialsOf(it.source_name || it.source_name_zh || 'MC'), x, y + 2);
  ctx.restore();
}

function drawDongqiudiXMark(ctx) {
  ctx.save();
  ctx.strokeStyle = '#e7e9ea';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(1010, 55);
  ctx.lineTo(1065, 123);
  ctx.moveTo(1062, 55);
  ctx.lineTo(1013, 123);
  ctx.stroke();
  ctx.restore();
}

async function buildDongqiudiShareCard(it) {
  const chinese = dongqiudiCleanText(it.text_zh);
  if (!chinese) throw new Error('NO_CHINESE_TEXT');
  const [mainText, ...quoteParts] = chinese.split(/\s*↪\s*/u);
  const inlineQuote = quoteParts.join(' ').trim();
  const original = dongqiudiCleanText(it.text);
  const quoteText = original && original !== mainText ? original : inlineQuote;
  const canvas = document.createElement('canvas');
  canvas.width = DONGQIUDI_CARD_WIDTH;
  canvas.height = DONGQIUDI_CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, DONGQIUDI_CARD_WIDTH, DONGQIUDI_CARD_HEIGHT);

  drawDongqiudiAvatar(ctx, it, 104, 102, 62);
  const source = it.source_name || it.source_name_zh || '未知信源';
  cardFont(ctx, 44, 800);
  ctx.fillStyle = '#f2f2f2';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const fittedSource = fitCanvasText(ctx, source, 690);
  ctx.fillText(fittedSource, 184, 88);
  const verifiedX = Math.min(910, 184 + ctx.measureText(fittedSource).width + 27);
  ctx.beginPath();
  ctx.arc(verifiedX, 73, 18, 0, Math.PI * 2);
  ctx.fillStyle = '#1d9bf0';
  ctx.fill();
  cardFont(ctx, 23, 900);
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.fillText('✓', verifiedX, 81);
  ctx.textAlign = 'left';
  cardFont(ctx, 37, 400);
  ctx.fillStyle = '#71767b';
  ctx.fillText(dongqiudiHandle(it), 184, 140);
  drawDongqiudiXMark(ctx);

  const mainLength = Array.from(mainText).length;
  const mainStyle = mainLength <= 90
    ? { size: 51, lineHeight: 69, maxLines: quoteText ? 7 : 11 }
    : mainLength <= 170
      ? { size: 44, lineHeight: 61, maxLines: quoteText ? 8 : 12 }
      : { size: 38, lineHeight: 54, maxLines: quoteText ? 9 : 14 };
  cardFont(ctx, mainStyle.size, 400);
  const mainLines = wrapDongqiudiText(ctx, mainText, 1115, mainStyle.maxLines);
  const mainBottom = drawDongqiudiLines(ctx, mainLines, 28, 278, mainStyle.lineHeight);

  if (quoteText) {
    const quoteY = Math.min(920, Math.max(620, mainBottom + 46));
    const quoteHeight = Math.max(260, 1240 - quoteY);
    roundedCanvasPath(ctx, 28, quoteY, 1119, quoteHeight, 34);
    ctx.strokeStyle = '#2f3336';
    ctx.lineWidth = 2;
    ctx.stroke();
    drawDongqiudiAvatar(ctx, it, 88, quoteY + 70, 32);
    cardFont(ctx, 35, 800);
    ctx.fillStyle = '#e7e9ea';
    const quoteSource = fitCanvasText(ctx, source, 590);
    const quoteSourceWidth = ctx.measureText(quoteSource).width;
    ctx.fillText(quoteSource, 136, quoteY + 82);
    const quoteVerifiedX = Math.min(760, 136 + quoteSourceWidth + 21);
    ctx.beginPath();
    ctx.arc(quoteVerifiedX, quoteY + 69, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#1d9bf0';
    ctx.fill();
    cardFont(ctx, 17, 900);
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.fillText('✓', quoteVerifiedX, quoteY + 75);
    ctx.textAlign = 'left';
    cardFont(ctx, 29, 400);
    ctx.fillStyle = '#71767b';
    ctx.fillText(dongqiudiHandle(it), quoteVerifiedX + 25, quoteY + 82);
    cardFont(ctx, 36, 400);
    const quoteLines = wrapDongqiudiText(ctx, quoteText, 1038, 6);
    drawDongqiudiLines(ctx, quoteLines, 66, quoteY + 154, 51);
  }

  cardFont(ctx, 38, 400);
  ctx.fillStyle = '#71767b';
  ctx.textAlign = 'left';
  const published = dongqiudiPublishedAt(it.published_at, it.tier || 'T2');
  ctx.fillText(published, 28, 1355);
  cardFont(ctx, 19, 400);
  ctx.fillStyle = '#536471';
  ctx.textAlign = 'right';
  ctx.fillText('adolfcns.github.io/city-transfer-hub/', 1147, 1400);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG_EXPORT_FAILED')), 'image/png', .96);
  });
}

function shareCardFilename(it) {
  const source = String(it.source_name_zh || it.source_name || '消息').replace(/[\\/:*?"<>|]/g, '-').slice(0, 24);
  return `曼城转会情报-${source}-${Date.now()}.png`;
}

function dongqiudiCardFilename(it) {
  const source = String(it.source_name_zh || it.source_name || '消息').replace(/[\\/:*?"<>|]/g, '-').slice(0, 24);
  return `懂球帝专享图-${source}-${Date.now()}.png`;
}

function downloadShareCard(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function showShareCardSavePreview(blob, filename, options = {}) {
  const url = URL.createObjectURL(blob);
  const overlay = el('div', 'share-save-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '保存分享图片');
  const panel = el('div', 'share-save-panel');
  const title = el('strong', 'share-save-title', options.title || '保存到手机');
  const hint = el('p', 'share-save-hint', options.hint || '若浏览器没有自动保存，请长按下方图片，选择“保存图片”或“存储到相册”。');
  const image = el('img', 'share-save-image');
  image.src = url;
  image.alt = options.alt || '当前消息的曼城转会分享图片';
  const controls = el('div', 'share-save-controls');
  const download = el('a', 'share-save-download', options.downloadLabel || '↓ 再次下载');
  download.href = url;
  download.download = filename;
  if (typeof options.onDownload === 'function') {
    download.addEventListener('click', () => { void options.onDownload(); });
  }
  const close = el('button', 'share-save-close', '完成');
  close.type = 'button';
  const dismiss = () => {
    overlay.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };
  close.onclick = dismiss;
  overlay.onclick = (event) => { if (event.target === overlay) dismiss(); };
  if (typeof options.onShare === 'function') {
    controls.classList.add('with-share');
    const share = el('button', 'share-save-share', options.shareLabel || '↗ 分享长图');
    share.type = 'button';
    share.onclick = async () => {
      share.disabled = true;
      try {
        if (await options.onShare() && options.closeAfterShare) dismiss();
      } finally { share.disabled = false; }
    };
    controls.append(share, download, close);
  } else {
    controls.append(download, close);
  }
  panel.append(title, hint, image, controls);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  close.focus({ preventScroll: true });
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 继续使用兼容复制 */ }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { /* 浏览器不支持兼容复制 */ }
  area.remove();
  return copied;
}

async function copyItemLink(it) {
  const copied = await copyText(itemShareUrl(it));
  toast(copied ? '这条消息的专属链接已复制 ✓' : '复制失败，请复制浏览器地址');
}

async function saveItemImage(it) {
  if (shareCardInFlight) {
    toast('图片正在生成，请稍候');
    return;
  }
  if (!String(it.text_zh || '').trim()) {
    toast('这条消息暂时没有中文，补译完成后即可保存图片');
    return;
  }
  shareCardInFlight = true;
  toast('正在生成这条消息的图片…');
  try {
    const blob = await buildSingleMessageShareCard(it);
    const filename = shareCardFilename(it);
    downloadShareCard(blob, filename);
    const needsLongPressFallback = /iP(?:hone|ad|od)|MicroMessenger/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (needsLongPressFallback) {
      showShareCardSavePreview(blob, filename);
      toast('已尝试下载；也可以长按图片保存到相册');
    } else {
      toast('图片已开始下载；若相册未显示，请查看“下载”文件夹 ✓');
    }
  } catch {
    toast('图片生成失败，请稍后再试');
  } finally {
    shareCardInFlight = false;
  }
}

async function saveDongqiudiImage(it) {
  if (shareCardInFlight) {
    toast('图片正在生成，请稍候');
    return;
  }
  if (!String(it.text_zh || '').trim()) {
    toast('这条消息暂时没有中文，补译完成后即可生成懂球帝专享图');
    return;
  }
  shareCardInFlight = true;
  toast('正在生成无二维码的懂球帝专享图…');
  try {
    const blob = await buildDongqiudiShareCard(it);
    const filename = dongqiudiCardFilename(it);
    downloadShareCard(blob, filename);
    const needsLongPressFallback = /iP(?:hone|ad|od)|MicroMessenger/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (needsLongPressFallback) {
      showShareCardSavePreview(blob, filename);
      toast('懂球帝专享图已生成，也可以长按图片保存到相册');
    } else {
      toast('懂球帝专享图已开始下载 ✓');
    }
  } catch {
    toast('懂球帝专享图生成失败，请稍后再试');
  } finally {
    shareCardInFlight = false;
  }
}

function buildCopyLinkButton(it, compact = false) {
  const share = el('button', 'library-action copy-link', compact ? '🔗' : '🔗 复制链接');
  share.type = 'button';
  share.title = '复制这条消息的专属链接';
  share.setAttribute('aria-label', '复制这条消息的专属链接');
  share.onclick = () => { copyItemLink(it); };
  return share;
}

function buildSaveImageButton(it, compact = false) {
  const save = el('button', 'library-action save', compact ? '↓' : '↓ 保存图片');
  save.type = 'button';
  save.title = '直接下载这条消息的图片';
  save.setAttribute('aria-label', '直接下载这条消息的图片');
  save.onclick = () => { saveItemImage(it); };
  return save;
}

function buildDongqiudiImageButton(it) {
  const save = el('button', 'library-action dongqiudi', '懂');
  save.type = 'button';
  save.title = '下载懂球帝专享图（无二维码）';
  save.setAttribute('aria-label', '下载懂球帝专享图，无二维码');
  save.onclick = () => { saveDongqiudiImage(it); };
  return save;
}

function buildLibraryActions(it, compact = false) {
  const id = itemId(it);
  const actions = el('div', compact ? 'library-actions compact' : 'library-actions');
  const share = buildCopyLinkButton(it, compact);
  const save = buildSaveImageButton(it, compact);
  const dongqiudi = buildDongqiudiImageButton(it);
  const favorite = el('button', `library-action favorite${state.library.favorites.has(id) ? ' on' : ''}`,
    compact ? (state.library.favorites.has(id) ? '★' : '☆') : (state.library.favorites.has(id) ? '★ 已收藏' : '☆ 收藏'));
  favorite.type = 'button';
  favorite.title = state.library.favorites.has(id) ? '取消收藏' : '收藏这条消息';
  favorite.setAttribute('aria-label', favorite.title);
  favorite.setAttribute('aria-pressed', state.library.favorites.has(id) ? 'true' : 'false');
  favorite.onclick = () => toggleFavorite(it);

  const read = el('button', `library-action read${state.library.read.has(id) ? ' on' : ''}`,
    compact ? (state.library.read.has(id) ? '✓' : '○') : (state.library.read.has(id) ? '✓ 已读' : '○ 标记已读'));
  read.type = 'button';
  read.title = state.library.read.has(id) ? '标记为未读' : '标记为已读';
  read.setAttribute('aria-label', read.title);
  read.setAttribute('aria-pressed', state.library.read.has(id) ? 'true' : 'false');
  read.onclick = () => toggleRead(it);
  actions.append(share, save, dongqiudi, favorite, read);
  return actions;
}
function syncLibraryActions(root, id) {
  const actions = root.querySelector('.library-actions');
  if (!actions) return;
  const compact = actions.classList.contains('compact');
  const isFavorite = state.library.favorites.has(id);
  const isRead = state.library.read.has(id);
  const favorite = actions.querySelector('.library-action.favorite');
  const read = actions.querySelector('.library-action.read');
  if (favorite) {
    favorite.classList.toggle('on', isFavorite);
    favorite.textContent = compact ? (isFavorite ? '★' : '☆') : (isFavorite ? '★ 已收藏' : '☆ 收藏');
    favorite.title = isFavorite ? '取消收藏' : '收藏这条消息';
    favorite.setAttribute('aria-label', favorite.title);
    favorite.setAttribute('aria-pressed', isFavorite ? 'true' : 'false');
  }
  if (read) {
    read.classList.toggle('on', isRead);
    read.textContent = compact ? (isRead ? '✓' : '○') : (isRead ? '✓ 已读' : '○ 标记已读');
    read.title = isRead ? '标记为未读' : '标记为已读';
    read.setAttribute('aria-label', read.title);
    read.setAttribute('aria-pressed', isRead ? 'true' : 'false');
  }
}
function syncRenderedItem(it) {
  const id = itemId(it);
  document.querySelectorAll('article[data-item-id]').forEach((node) => {
    if (node.dataset.itemId !== id) return;
    node.classList.toggle('is-read', state.library.read.has(id));
    syncLibraryActions(node, id);
  });
}
function syncAllRenderedItems() {
  const byId = new Map(state.items.map((it) => [itemId(it), it]));
  document.querySelectorAll('article[data-item-id]').forEach((node) => {
    const it = byId.get(node.dataset.itemId);
    if (!it) return;
    node.classList.toggle('is-read', state.library.read.has(node.dataset.itemId));
    syncLibraryActions(node, node.dataset.itemId);
  });
}
function refreshLibraryUi(it, changedState) {
  updateLibraryBar();
  const filterNeedsRefresh = (changedState === 'favorite' && state.filters.libraryView === 'favorites')
    || (changedState === 'read' && state.filters.libraryView === 'unread');
  if (filterNeedsRefresh) renderFeed();
  else syncRenderedItem(it);
}
function updateLibraryBar() {
  const currentIds = new Set(state.items.map(itemId));
  const favoriteCount = [...state.library.favorites].filter((id) => currentIds.has(id)).length;
  const unloadedCount = Math.max(0, state.totalItems - state.items.length);
  const unreadCount = state.items.reduce((n, it) => n + (state.library.read.has(itemId(it)) ? 0 : 1), unloadedCount);
  $('#count-all').textContent = String(Math.max(state.totalItems, state.items.length));
  $('#count-unread').textContent = String(unreadCount);
  $('#count-favorites').textContent = String(favoriteCount);
  document.querySelectorAll('[data-library-view]').forEach((button) => {
    const active = button.dataset.libraryView === state.filters.libraryView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const markAll = $('#mark-all-read');
  markAll.hidden = unreadCount === 0;
  markAll.disabled = unreadCount === 0;
  markAll.textContent = '✓ 全读';
  markAll.title = `将 ${unreadCount} 条未读消息全部标为已读`;
  markAll.setAttribute('aria-label', markAll.title);
}

function loadPrayerCount() {
  try {
    const value = Number(localStorage.getItem(PRAYER_KEY) || 0);
    return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 999999) : 0;
  } catch { return 0; }
}

function savePrayerCount(count) {
  try { localStorage.setItem(PRAYER_KEY, String(count)); } catch { /* 本次访问内仍可继续互动 */ }
}

function compactCount(count) {
  if (count < 10000) return count.toLocaleString('zh-CN');
  const value = count / 10000;
  return `${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')}万`;
}

function prayerMilestoneStep(count) {
  if (count < 100) return 50;
  if (count < 1000) return 100;
  return PRAYER_GOAL_STEP;
}

function nextPrayerGoal(count) {
  return Math.max(
    PRAYER_GOAL_START,
    Math.ceil((count + 1) / PRAYER_GOAL_STEP) * PRAYER_GOAL_STEP,
  );
}

function renderPrayerCount(localCount, globalCount = null, syncState = 'loading') {
  const button = $('#city-prayer');
  const countNode = $('#prayer-count');
  const hasGlobal = syncState !== 'error' && Number.isSafeInteger(globalCount) && globalCount >= 0;
  let accessible;
  if (hasGlobal) {
    const goal = nextPrayerGoal(globalCount);
    const remaining = goal - globalCount;
    const totalLine = el('span', 'prayer-total');
    totalLine.append('全站已汇集 ', el('b', 'prayer-count-number', `${compactCount(globalCount)} 次`), '蓝月好运');
    const goalLine = el('span', 'prayer-goal');
    goalLine.append('距 ', el('b', '', `${compactCount(goal)} 次`), '还差 ', el('b', '', `${compactCount(remaining)} 次`));
    accessible = `点击为曼城添一次好运。全站已汇集 ${globalCount} 次蓝月好运。距离 ${goal} 次还差 ${remaining} 次。`;
    countNode.replaceChildren(totalLine, goalLine);
  } else {
    const status = syncState === 'error' ? '全站同步暂不可用' : '全站次数加载中';
    countNode.textContent = status;
    accessible = `点击为曼城添一次好运。${syncState === 'error' ? '全站同步暂不可用。' : '全站次数加载中。'}`;
  }
  button.title = accessible;
  button.setAttribute('aria-label', accessible);
}

function bindPrayer() {
  const button = $('#city-prayer');
  let localCount = loadPrayerCount();
  let globalCount = null;
  let syncState = 'loading';
  let activeEndpoint = PRAYER_ENDPOINTS[0];
  let requestInFlight = false;
  renderPrayerCount(localCount, globalCount, syncState);

  const fetchPrayer = async (endpoint, method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      return await fetch(endpoint, { method, cache: 'no-store', signal: controller.signal });
    } finally { clearTimeout(timer); }
  };

  const loadGlobalCount = async () => {
    for (const endpoint of PRAYER_ENDPOINTS) {
      try {
        const res = await fetchPrayer(endpoint, 'GET');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !Number.isSafeInteger(data.count) || data.count < 0) continue;
        if (requestInFlight) return;
        activeEndpoint = endpoint;
        globalCount = data.count;
        syncState = 'ready';
        renderPrayerCount(localCount, globalCount, syncState);
        return;
      } catch { /* 读取可安全尝试下一个入口 */ }
    }
    if (requestInFlight) return;
    syncState = 'error';
    renderPrayerCount(localCount, globalCount, syncState);
  };
  loadGlobalCount();

  button.onclick = async () => {
    if (requestInFlight) return;
    requestInFlight = true;
    button.disabled = true;
    localCount = Math.min(localCount + 1, 999999);
    savePrayerCount(localCount);
    renderPrayerCount(localCount, globalCount, syncState);
    button.classList.remove('hit');
    requestAnimationFrame(() => button.classList.add('hit'));
    setTimeout(() => button.classList.remove('hit'), 360);
    try { navigator.vibrate?.(30); } catch { /* 部分浏览器不支持轻触震动 */ }
    toast('咚！正在送出你的蓝月好运…');
    try {
      // 写入只请求已成功读取的同一个入口，网络超时时不跨入口重试，避免重复 +1。
      const res = await fetchPrayer(activeEndpoint, 'POST');
      const data = await res.json().catch(() => ({}));
      if (Number.isSafeInteger(data.count) && data.count >= 0) {
        globalCount = data.count;
        syncState = 'ready';
        renderPrayerCount(localCount, globalCount, syncState);
      }
      if (res.ok && Number.isSafeInteger(globalCount)) {
        const step = prayerMilestoneStep(globalCount);
        const achieved = globalCount > 0 && globalCount % step === 0;
        toast(achieved
          ? `蓝月好运突破 ${globalCount.toLocaleString('zh-CN')} 次！💙`
          : `收到！你送出了全站第 ${globalCount.toLocaleString('zh-CN')} 次蓝月好运 💙`);
      } else if (res.status === 429) toast('好运收到啦，稍慢一点再敲 💙');
      else {
        syncState = 'error';
        renderPrayerCount(localCount, globalCount, syncState);
        toast('本次好运已保存在本机，全站计数暂时不可用');
      }
    } catch {
      syncState = 'error';
      renderPrayerCount(localCount, globalCount, syncState);
      toast('本次好运已保存在本机，全站计数暂未连接');
    } finally {
      requestInFlight = false;
      button.disabled = false;
    }
  };
}

// ---------------- 每条消息的全站表情 ----------------
function syncReactionBars(id) {
  const counts = itemReactionCounts(id);
  const selected = state.reactionPrefs.votes[id] || null;
  document.querySelectorAll('article[data-item-id]').forEach((article) => {
    if (article.dataset.itemId !== id) return;
    article.querySelectorAll('.reaction-bar').forEach((bar) => {
      bar.querySelectorAll('.reaction-btn').forEach((button) => {
        const def = REACTION_DEFS.find((item) => item.key === button.dataset.reaction);
        if (!def) return;
        const count = counts[def.key] || 0;
        const active = selected === def.key;
        button.classList.toggle('selected', active);
        button.disabled = reactionInFlight.has(id);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.setAttribute('aria-label', `${def.label}，全站 ${count} 次${active ? '，你已选择' : ''}`);
        button.title = `${def.label} · 全站 ${count} 次`;
        const countNode = button.querySelector('.reaction-count');
        if (countNode) {
          countNode.hidden = count === 0;
          countNode.textContent = count > 0 ? compactReactionCount(count) : '';
        }
      });
      const total = REACTION_DEFS.reduce((sum, def) => sum + (counts[def.key] || 0), 0);
      const hint = bar.querySelector('.reaction-hint');
      if (hint) {
        hint.textContent = total === 0 ? hint.dataset.emptyText : hint.dataset.activeText;
        hint.hidden = !hint.textContent;
      }
    });
  });
}

function syncAllReactionBars() {
  const ids = new Set([...document.querySelectorAll('article[data-item-id]')].map((node) => node.dataset.itemId));
  ids.forEach(syncReactionBars);
}

function buildReactionBar(it, compact = false, context = 'feed') {
  const id = itemId(it);
  const counts = itemReactionCounts(id);
  const selected = state.reactionPrefs.votes[id] || null;
  const bar = el('div', `reaction-bar${compact ? ' compact' : ''}`);
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', '给这条消息选择一个表情');
  const total = REACTION_DEFS.reduce((sum, def) => sum + (counts[def.key] || 0), 0);
  const hint = el('span', 'reaction-hint');
  hint.dataset.emptyText = context === 'pinned' ? '你怎么看？ · 抢先表态' : '抢先表态';
  hint.dataset.activeText = context === 'pinned' ? '你怎么看？' : '';
  hint.textContent = total === 0 ? hint.dataset.emptyText : hint.dataset.activeText;
  hint.hidden = !hint.textContent;
  bar.appendChild(hint);
  for (const def of REACTION_DEFS) {
    const active = selected === def.key;
    const count = counts[def.key] || 0;
    const button = el('button', `reaction-btn${active ? ' selected' : ''}`);
    button.type = 'button';
    button.dataset.reaction = def.key;
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.setAttribute('aria-label', `${def.label}，全站 ${count} 次${active ? '，你已选择' : ''}`);
    button.title = `${def.label} · 全站 ${count} 次`;
    const emoji = el('span', 'reaction-emoji', def.emoji);
    emoji.setAttribute('aria-hidden', 'true');
    const countNode = el('span', 'reaction-count', count > 0 ? compactReactionCount(count) : '');
    countNode.hidden = count === 0;
    button.append(emoji, countNode);
    button.onclick = () => chooseItemReaction(it, def.key);
    bar.appendChild(button);
  }
  return bar;
}

async function fetchReactionEndpoint(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(url, { cache: 'no-store', signal: controller.signal, ...options });
  } finally { clearTimeout(timer); }
}

async function loadReactionSnapshot() {
  if (reactionSnapshotLoaded) return;
  reactionSnapshotLoaded = true;
  try {
    const res = await fetch(`${REACTION_SNAPSHOT_URL}?t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.counts) {
      mergeItemReactionCounts(data.counts);
      syncAllReactionBars();
    }
  } catch { /* 同站快照失败时仍显示本地 0，不阻塞页面 */ }
}

function scheduleDeferredReactionSnapshot() {
  const run = () => loadReactionSnapshot();
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1800);
}

function queueReactionCounts(items) {
  for (const it of items || []) {
    const id = itemId(it);
    if (!reactionLiveLoaded.has(id)) reactionReadQueue.add(id);
  }
  if (reactionReadTimer || reactionReadQueue.size === 0) return;
  reactionReadTimer = setTimeout(flushReactionCountQueue, 0);
}

async function flushReactionCountQueue() {
  reactionReadTimer = null;
  const ids = [...reactionReadQueue].slice(0, 48);
  ids.forEach((id) => reactionReadQueue.delete(id));
  if (reactionReadQueue.size) reactionReadTimer = setTimeout(flushReactionCountQueue, 20);
  if (ids.length === 0) return;

  for (const endpoint of REACTION_ENDPOINTS) {
    try {
      const res = await fetchReactionEndpoint(`${endpoint}?ids=${encodeURIComponent(ids.join(','))}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true || !data.counts) continue;
      state.reactionEndpoint = endpoint;
      mergeItemReactionCounts(data.counts);
      ids.forEach((id) => reactionLiveLoaded.add(id));
      ids.forEach(syncReactionBars);
      flushPendingReactions();
      return;
    } catch { /* 尝试下一个直连接口 */ }
  }
}

async function sendItemReaction(id, reaction, silent = false) {
  if (reactionInFlight.has(id)) return false;
  const endpoint = state.reactionEndpoint || REACTION_ENDPOINTS[0];
  reactionInFlight.add(id);
  syncReactionBars(id);
  try {
    const res = await fetchReactionEndpoint(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, reaction, voter: state.reactionPrefs.voter }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true || !data.counts?.[id]) throw new Error(data.reason || `HTTP ${res.status}`);
    state.reactionEndpoint = endpoint;
    mergeItemReactionCounts(data.counts);
    if (state.reactionPrefs.pending[id] === reaction) delete state.reactionPrefs.pending[id];
    saveReactionPrefs();
    if (!silent) toast('表情已同步到全站 ✓');
    return true;
  } catch {
    if (!silent) toast('表情已保存在本机，全站同步稍后自动重试');
    return false;
  } finally {
    reactionInFlight.delete(id);
    syncReactionBars(id);
  }
}

function chooseItemReaction(it, reaction) {
  const id = itemId(it);
  const def = REACTION_DEFS.find((item) => item.key === reaction);
  if (!def) return;
  const previous = state.reactionPrefs.votes[id] || null;
  if (previous === reaction) {
    toast(`你已经选择了「${def.label}」`);
    return;
  }
  state.reactionPrefs.votes[id] = reaction;
  state.reactionPrefs.pending[id] = reaction;
  saveReactionPrefs();
  syncReactionBars(id);
  toast(`${def.emoji} 已选择「${def.label}」，正在同步`);
  sendItemReaction(id, reaction);
}

async function flushPendingReactions() {
  if (reactionPendingFlush || !state.reactionEndpoint) return;
  reactionPendingFlush = true;
  try {
    const pending = Object.entries(state.reactionPrefs.pending).slice(0, 12);
    for (const [id, reaction] of pending) await sendItemReaction(id, reaction, true);
  } finally { reactionPendingFlush = false; }
}

// ---------------- 工具 ----------------
const $ = (sel) => document.querySelector(sel);
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function relTime(iso) {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)} 分钟前`;
  if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} 小时前`;
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((today - that) / 86400e3);
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${wd}`;
}
// 按信源名生成稳定的头像色
function hueOf(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.codePointAt(0)) % 360;
  return h;
}
function initialsOf(name) {
  const words = name.replace(/\(.*?\)/g, '').trim().split(/\s+/);
  return words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}
// 搜索词高亮（安全：全部走 DOM 文本节点）
function highlightInto(parent, text, kw) {
  if (!kw) { parent.textContent = text; return; }
  const lower = text.toLowerCase();
  const k = kw.toLowerCase();
  let i = 0;
  while (true) {
    const j = lower.indexOf(k, i);
    if (j === -1) { parent.appendChild(document.createTextNode(text.slice(i))); break; }
    parent.appendChild(document.createTextNode(text.slice(i, j)));
    parent.appendChild(el('mark', null, text.slice(j, j + k.length)));
    i = j + k.length;
  }
}

// ---------------- 每条消息的游客短评 ----------------
function itemCommentCount(id) {
  return Math.max(0, Number(state.commentCounts[id] || 0));
}

function syncCommentButtons(id) {
  const count = itemCommentCount(id);
  document.querySelectorAll('.comment-action').forEach((button) => {
    if (button.dataset.itemId !== id) return;
    const countNode = button.querySelector('.comment-count');
    if (countNode) {
      countNode.hidden = count === 0;
      countNode.textContent = count > 0 ? String(Math.min(999, count)) : '';
    }
    button.setAttribute('aria-label', count > 0 ? `查看这条消息的 ${count} 条评论` : '评论这条消息');
    button.title = count > 0 ? `评论 ${count}` : '抢先评论';
  });
}

function buildCommentButton(it, compact = false) {
  const id = itemId(it);
  const count = itemCommentCount(id);
  const button = el('button', `comment-action${compact ? ' compact' : ''}`);
  button.type = 'button';
  button.dataset.itemId = id;
  button.appendChild(el('span', 'comment-icon', '💬'));
  button.appendChild(el('span', 'comment-label', '评论'));
  const countNode = el('span', 'comment-count', count > 0 ? String(Math.min(999, count)) : '');
  countNode.hidden = count === 0;
  button.appendChild(countNode);
  button.setAttribute('aria-label', count > 0 ? `查看这条消息的 ${count} 条评论` : '评论这条消息');
  button.title = count > 0 ? `评论 ${count}` : '抢先评论';
  button.onclick = () => openComments(it);
  return button;
}

function queueCommentCounts(items) {
  for (const it of items || []) {
    const id = itemId(it);
    if (!commentLiveLoaded.has(id)) commentReadQueue.add(id);
  }
  if (commentReadTimer || commentReadQueue.size === 0) return;
  commentReadTimer = setTimeout(flushCommentCountQueue, 0);
}

function ensureEngagementObserver() {
  if (engagementObserver || !('IntersectionObserver' in window)) return engagementObserver;
  engagementObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const item = engagementItems.get(entry.target);
      engagementObserver.unobserve(entry.target);
      entry.target.removeAttribute('data-engagement-pending');
      if (!item) continue;
      queueReactionCounts([item]);
      queueCommentCounts([item]);
    }
  }, { rootMargin: '320px 0px' });
  return engagementObserver;
}

function observeEngagement(card, item) {
  const observer = ensureEngagementObserver();
  if (!observer) {
    setTimeout(() => {
      queueReactionCounts([item]);
      queueCommentCounts([item]);
    }, 300);
    return;
  }
  engagementItems.set(card, item);
  card.dataset.engagementPending = '1';
  observer.observe(card);
}

function clearEngagementWatchers(container) {
  if (!engagementObserver || !container) return;
  container.querySelectorAll('[data-engagement-pending]').forEach((node) => {
    engagementObserver.unobserve(node);
    node.removeAttribute('data-engagement-pending');
  });
}

async function flushCommentCountQueue() {
  commentReadTimer = null;
  const ids = [...commentReadQueue].slice(0, 48);
  ids.forEach((id) => commentReadQueue.delete(id));
  if (commentReadQueue.size) commentReadTimer = setTimeout(flushCommentCountQueue, 30);
  if (ids.length === 0) return;

  for (const endpoint of COMMENT_ENDPOINTS) {
    try {
      const res = await fetchReactionEndpoint(`${endpoint}?ids=${encodeURIComponent(ids.join(','))}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true || !data.counts) continue;
      state.commentEndpoint = endpoint;
      for (const id of ids) {
        state.commentCounts[id] = Math.max(0, Number(data.counts[id] || 0));
        commentLiveLoaded.add(id);
        syncCommentButtons(id);
      }
      return;
    } catch { /* 尝试备用直连接口 */ }
  }
}

function randomGuestNickname() {
  return `蓝月球迷${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
}

function commentReasonText(reason, retryAt = 0) {
  if (reason === 'nickname_length') return '昵称需要 2～10 个字';
  if (reason === 'nickname_chars') return '昵称仅支持中文、字母、数字和 · _ -';
  if (reason === 'nickname_blocked') return '昵称涉及政治人物、机构或冒充身份，请换一个';
  if (reason === 'nickname_locked') {
    const date = retryAt ? new Date(retryAt).toLocaleDateString('zh-CN') : '七天后';
    return `昵称暂不能修改，可在 ${date} 后更换`;
  }
  if (reason === 'comment_length') return '评论需要 2～120 个字';
  if (reason === 'comment_link') return '评论暂不支持网址或广告链接';
  if (reason === 'bad_parent') return '原评论已不存在或暂时不能回复，请刷新后再试';
  if (reason === 'slow_down') return '发送得有点快，请 30 秒后再试';
  return '评论服务暂时不可用，请稍后再试';
}

function closeComments() {
  document.querySelector('.comment-overlay')?.remove();
  document.body.classList.remove('comments-open');
  activeCommentItem = null;
  activeReplyTarget = null;
}

function commentAvatarText(nickname) {
  return [...String(nickname || '蓝')][0] || '蓝';
}

function clearCommentReply() {
  activeReplyTarget = null;
  const replying = document.querySelector('.comment-replying');
  if (replying) replying.hidden = true;
  const input = document.querySelector('.comment-input');
  if (input) input.placeholder = '友善发言，最多120字';
}

function startCommentReply(comment) {
  if (!comment || comment.parent_id) return;
  activeReplyTarget = { id: String(comment.id), nickname: String(comment.nickname) };
  const replying = document.querySelector('.comment-replying');
  const name = replying?.querySelector('.comment-replying-name');
  if (name) name.textContent = `正在回复 @${activeReplyTarget.nickname}`;
  if (replying) replying.hidden = false;
  const input = document.querySelector('.comment-input');
  if (input) {
    input.placeholder = `回复 @${activeReplyTarget.nickname}，最多120字`;
    input.focus();
  }
}

async function likeItemComment(commentId, button) {
  if (!button || button.disabled) return;
  const desired = button.dataset.liked !== 'true';
  button.disabled = true;
  const endpoints = state.commentEndpoint
    ? [state.commentEndpoint, ...COMMENT_ENDPOINTS.filter((item) => item !== state.commentEndpoint)]
    : COMMENT_ENDPOINTS;
  let result = null;
  for (const endpoint of endpoints) {
    try {
      const res = await fetchReactionEndpoint(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'like', comment_id: commentId, voter: state.commentProfile.voter, liked: desired,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok === true) {
        state.commentEndpoint = endpoint;
        result = data;
        break;
      }
    } catch { /* 网络错误时尝试备用端点 */ }
  }
  button.disabled = false;
  if (!result) {
    toast('点赞没有提交成功，请稍后再试', 'err');
    return;
  }
  const count = Math.max(0, Number(result.like_count || 0));
  button.dataset.liked = result.liked ? 'true' : 'false';
  button.classList.toggle('liked', Boolean(result.liked));
  button.setAttribute('aria-pressed', result.liked ? 'true' : 'false');
  button.setAttribute('aria-label', `${result.liked ? '取消点赞' : '点赞'}，当前 ${count} 次`);
  const countNode = button.querySelector('.comment-like-count');
  if (countNode) countNode.textContent = String(count);
}

function renderCommentRows(comments) {
  const list = document.querySelector('.comment-list');
  if (!list) return;
  list.textContent = '';
  if (!comments.length) {
    const empty = el('div', 'comment-empty');
    empty.appendChild(el('strong', null, '还没有评论'));
    empty.appendChild(el('span', null, '说说你对这条转会消息的看法吧。'));
    list.appendChild(empty);
    return;
  }
  const roots = comments
    .filter((comment) => !comment.parent_id)
    .sort((a, b) => Number(b.created_at) - Number(a.created_at));
  const replies = new Map();
  for (const comment of comments) {
    if (!comment.parent_id) continue;
    const rows = replies.get(comment.parent_id) || [];
    rows.push(comment);
    replies.set(comment.parent_id, rows);
  }

  const buildRow = (comment, isReply = false) => {
    const row = el('article', 'comment-row');
    if (isReply) row.classList.add('comment-reply-row');
    row.dataset.commentId = comment.id;
    const avatar = el('span', 'comment-avatar', commentAvatarText(comment.nickname));
    avatar.style.background = `hsl(${hueOf(comment.nickname)}, 58%, 83%)`;
    const body = el('div', 'comment-row-body');
    const meta = el('div', 'comment-meta');
    meta.appendChild(el('strong', null, comment.nickname));
    meta.appendChild(el('span', 'comment-guest-badge', '游客'));
    if (isReply && comment.parent_nickname) {
      meta.appendChild(el('span', 'comment-reply-target', `回复 @${comment.parent_nickname}`));
    }
    meta.appendChild(el('time', null, relTime(new Date(Number(comment.created_at)).toISOString())));
    const actions = el('div', 'comment-actions');
    if (!isReply) {
      const reply = el('button', 'comment-reply', '回复');
      reply.type = 'button';
      reply.setAttribute('aria-label', `回复 ${comment.nickname}`);
      reply.onclick = () => startCommentReply(comment);
      actions.appendChild(reply);
    }
    const likeCount = Math.max(0, Number(comment.like_count || 0));
    const like = el('button', 'comment-like');
    like.type = 'button';
    like.dataset.liked = comment.liked_by_me ? 'true' : 'false';
    like.classList.toggle('liked', Boolean(comment.liked_by_me));
    like.setAttribute('aria-pressed', comment.liked_by_me ? 'true' : 'false');
    like.setAttribute('aria-label', `${comment.liked_by_me ? '取消点赞' : '点赞'}，当前 ${likeCount} 次`);
    like.appendChild(el('span', 'comment-like-icon', '👍'));
    like.appendChild(el('span', 'comment-like-count', String(likeCount)));
    like.onclick = () => likeItemComment(comment.id, like);
    actions.appendChild(like);
    const report = el('button', 'comment-report', '举报');
    report.type = 'button';
    report.setAttribute('aria-label', `举报 ${comment.nickname} 的评论`);
    report.onclick = () => reportItemComment(comment.id, report);
    actions.appendChild(report);
    body.append(meta, el('p', 'comment-text', comment.body), actions);
    row.append(avatar, body);
    return row;
  };

  for (const comment of roots) {
    const thread = el('section', 'comment-thread');
    thread.appendChild(buildRow(comment));
    const children = (replies.get(comment.id) || [])
      .sort((a, b) => Number(a.created_at) - Number(b.created_at));
    if (children.length) {
      const replyList = el('div', 'comment-replies');
      children.forEach((reply) => replyList.appendChild(buildRow(reply, true)));
      thread.appendChild(replyList);
    }
    list.appendChild(thread);
  }
}

function updateCommentProfileRow() {
  const row = document.querySelector('.comment-profile-row');
  if (!row) return;
  const nickname = state.commentProfile.nickname;
  const name = row.querySelector('.comment-profile-name');
  const edit = row.querySelector('.comment-profile-edit');
  if (name) name.textContent = nickname ? `游客 · ${nickname}` : '首次评论时设置昵称';
  if (edit) edit.textContent = nickname ? '修改' : '设置';
}

function openNicknameDialog(pendingComment = '') {
  const sheet = document.querySelector('.comment-sheet');
  if (!sheet) return;
  const current = state.commentProfile.nickname;
  if (current && state.commentProfile.nicknameUpdatedAt
      && Date.now() - state.commentProfile.nicknameUpdatedAt < NICKNAME_CHANGE_MS
      && !pendingComment) {
    toast(commentReasonText('nickname_locked', state.commentProfile.nicknameUpdatedAt + NICKNAME_CHANGE_MS));
    return;
  }
  sheet.querySelector('.nickname-backdrop')?.remove();
  const backdrop = el('div', 'nickname-backdrop');
  const box = el('div', 'nickname-box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', current ? '修改评论昵称' : '设置评论昵称');
  box.appendChild(el('h3', null, current ? '修改游客昵称' : '给自己起个昵称'));
  box.appendChild(el('p', null, '无需注册。政治人物、政治机构及“站长”“官方”等冒充类名称不可使用。'));
  const input = document.createElement('input');
  input.className = 'nickname-input';
  input.maxLength = 10;
  input.autocomplete = 'nickname';
  input.placeholder = '2～10个字';
  input.value = current || randomGuestNickname();
  const error = el('div', 'nickname-error');
  const actions = el('div', 'nickname-actions');
  const cancel = el('button', 'nickname-cancel', '取消');
  cancel.type = 'button';
  cancel.onclick = () => backdrop.remove();
  const save = el('button', 'nickname-save', pendingComment ? '保存并发送' : '保存昵称');
  save.type = 'button';
  save.onclick = async () => {
    const nickname = normalizeNickname(input.value);
    const message = nicknameError(nickname);
    if (message) { error.textContent = message; input.focus(); return; }
    if (pendingComment) {
      const ok = await sendItemComment(pendingComment, nickname);
      if (ok) backdrop.remove();
      return;
    }
    if (current && current !== nickname) state.commentProfile.nicknameUpdatedAt = Date.now();
    state.commentProfile.nickname = nickname;
    saveCommentProfile();
    updateCommentProfileRow();
    backdrop.remove();
    toast('昵称已保存在本机，将在下次评论时生效');
  };
  actions.append(cancel, save);
  box.append(input, error, actions);
  backdrop.appendChild(box);
  backdrop.onclick = (event) => { if (event.target === backdrop) backdrop.remove(); };
  sheet.appendChild(backdrop);
  setTimeout(() => { input.focus(); input.select(); }, 30);
}

async function loadItemComments(it) {
  const id = itemId(it);
  const list = document.querySelector('.comment-list');
  if (list) list.innerHTML = '<div class="comment-loading">正在加载评论…</div>';
  for (const endpoint of COMMENT_ENDPOINTS) {
    try {
      const res = await fetchReactionEndpoint(
        `${endpoint}?item=${encodeURIComponent(id)}&voter=${encodeURIComponent(state.commentProfile.voter)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true || !Array.isArray(data.comments)) continue;
      if (!activeCommentItem || itemId(activeCommentItem) !== id) return;
      state.commentEndpoint = endpoint;
      state.commentCounts[id] = Math.max(0, Number(data.count || 0));
      commentLiveLoaded.add(id);
      syncCommentButtons(id);
      const titleCount = document.querySelector('.comment-sheet-count');
      if (titleCount) titleCount.textContent = state.commentCounts[id] > 0 ? ` ${state.commentCounts[id]}` : '';
      if (activeReplyTarget && !data.comments.some((comment) => comment.id === activeReplyTarget.id && !comment.parent_id)) {
        clearCommentReply();
      }
      renderCommentRows(data.comments);
      return;
    } catch { /* 尝试备用接口 */ }
  }
  if (list) list.innerHTML = '<div class="comment-loading error">评论暂时加载失败，请稍后重试</div>';
}

async function sendItemComment(value, nicknameOverride = '') {
  if (!activeCommentItem || commentRequestInFlight) return false;
  const textarea = document.querySelector('.comment-input');
  const body = String(value || textarea?.value || '').normalize('NFKC').trim();
  const bodyMessage = commentBodyError(body);
  if (bodyMessage) { toast(bodyMessage, 'err'); textarea?.focus(); return false; }
  const nickname = normalizeNickname(nicknameOverride || state.commentProfile.nickname);
  const nicknameMessage = nicknameError(nickname);
  if (nicknameMessage) {
    openNicknameDialog(body);
    return false;
  }

  commentRequestInFlight = true;
  const wasReply = Boolean(activeReplyTarget);
  const send = document.querySelector('.comment-send');
  if (send) { send.disabled = true; send.textContent = '发送中'; }
  let failure = 'network';
  let retryAt = 0;
  try {
    const endpoints = state.commentEndpoint
      ? [state.commentEndpoint, ...COMMENT_ENDPOINTS.filter((item) => item !== state.commentEndpoint)]
      : COMMENT_ENDPOINTS;
    for (const endpoint of endpoints) {
      try {
        const res = await fetchReactionEndpoint(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: itemId(activeCommentItem),
            voter: state.commentProfile.voter,
            nickname,
            comment: body,
            parent_id: activeReplyTarget?.id || '',
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok === true && data.comment) {
          const changed = state.commentProfile.nickname !== nickname;
          state.commentEndpoint = endpoint;
          state.commentProfile.nickname = nickname;
          if (changed || !state.commentProfile.nicknameUpdatedAt) state.commentProfile.nicknameUpdatedAt = Date.now();
          saveCommentProfile();
          updateCommentProfileRow();
          if (textarea) textarea.value = '';
          clearCommentReply();
          state.commentCounts[itemId(activeCommentItem)] = Math.max(0, Number(data.count || 0));
          syncCommentButtons(itemId(activeCommentItem));
          await loadItemComments(activeCommentItem);
          toast(wasReply ? '回复已发布 ✓' : '评论已发布 ✓');
          return true;
        }
        failure = data.reason || 'network';
        retryAt = Number(data.retry_at || 0);
        if ([400, 409, 429].includes(res.status)) break;
      } catch { /* 网络错误时尝试备用端点 */ }
    }
    toast(commentReasonText(failure, retryAt), 'err');
    return false;
  } finally {
    commentRequestInFlight = false;
    if (send) { send.disabled = false; send.textContent = '发送'; }
  }
}

async function reportItemComment(commentId, button) {
  if (!window.confirm('确认举报这条评论吗？同一设备只能举报一次。')) return;
  button.disabled = true;
  let result = null;
  for (const endpoint of COMMENT_ENDPOINTS) {
    try {
      const res = await fetchReactionEndpoint(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'report', comment_id: commentId, voter: state.commentProfile.voter }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok === true) { state.commentEndpoint = endpoint; result = data; break; }
    } catch { /* 尝试备用端点 */ }
  }
  if (!result) {
    button.disabled = false;
    toast('举报没有提交成功，请稍后再试', 'err');
    return;
  }
  button.textContent = result.already_reported ? '已举报' : '举报成功';
  if (result.hidden && activeCommentItem) {
    await loadItemComments(activeCommentItem);
  }
  toast(result.already_reported ? '你已经举报过这条评论' : '举报已收到，感谢维护评论区');
}

function openComments(it) {
  closeComments();
  activeCommentItem = it;
  const overlay = el('div', 'comment-overlay');
  const sheet = el('section', 'comment-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', '消息评论');
  sheet.appendChild(el('div', 'comment-sheet-handle'));
  const head = el('div', 'comment-sheet-head');
  const title = el('h2', null, '评论');
  title.appendChild(el('span', 'comment-sheet-count', itemCommentCount(itemId(it)) ? ` ${itemCommentCount(itemId(it))}` : ''));
  const close = el('button', 'comment-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', '关闭评论');
  close.onclick = closeComments;
  head.append(title, close);
  const summary = el('div', 'comment-item-summary', String(it.text_zh || it.text || '').replace(/\s+/g, ' ').slice(0, 58));
  const list = el('div', 'comment-list');
  list.appendChild(el('div', 'comment-loading', '正在加载评论…'));

  const composer = el('div', 'comment-composer');
  const replying = el('div', 'comment-replying');
  replying.hidden = true;
  replying.appendChild(el('span', 'comment-replying-name'));
  const cancelReply = el('button', 'comment-reply-cancel', '取消回复 ×');
  cancelReply.type = 'button';
  cancelReply.onclick = clearCommentReply;
  replying.appendChild(cancelReply);
  const profileRow = el('div', 'comment-profile-row');
  profileRow.appendChild(el('span', 'comment-profile-name'));
  const edit = el('button', 'comment-profile-edit');
  edit.type = 'button';
  edit.onclick = () => openNicknameDialog();
  profileRow.appendChild(edit);
  profileRow.appendChild(el('span', 'comment-profile-note', '无需注册 · 昵称仅保存在本机'));
  const inputRow = el('div', 'comment-input-row');
  const input = document.createElement('textarea');
  input.className = 'comment-input';
  input.rows = 1;
  input.maxLength = 120;
  input.placeholder = '友善发言，最多120字';
  input.setAttribute('aria-label', '评论内容');
  const send = el('button', 'comment-send', '发送');
  send.type = 'button';
  send.onclick = () => {
    const body = input.value.trim();
    const message = commentBodyError(body);
    if (message) { toast(message, 'err'); input.focus(); return; }
    if (!state.commentProfile.nickname) openNicknameDialog(body);
    else sendItemComment(body);
  };
  input.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); send.click(); }
  });
  inputRow.append(input, send);
  composer.append(replying, profileRow, inputRow);
  sheet.append(head, summary, list, composer);
  overlay.appendChild(sheet);
  overlay.onclick = (event) => { if (event.target === overlay) closeComments(); };
  document.body.appendChild(overlay);
  document.body.classList.add('comments-open');
  updateCommentProfileRow();
  loadItemComments(it);
}

// ---------------- 数据加载 ----------------
async function fetchJSON(url) {
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchInitialData() {
  try { return await fetchJSON(DATA_URL); }
  catch { return fetchJSON(DATA_FALLBACK_URL); }
}

function archiveUrl(file) {
  return `./data/${encodeURIComponent(String(file || ''))}`;
}

function hasMoreArchives() {
  return state.archiveFiles.some((file) => !state.loadedArchiveFiles.has(file));
}

function mergeArchiveItems(items) {
  const byId = new Map(state.items.map((item) => [itemId(item), item]));
  for (const item of items || []) {
    if (!item?.id || byId.has(itemId(item))) continue;
    byId.set(itemId(item), item);
    state.seenIds.add(itemId(item));
  }
  state.items = [...byId.values()].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  updateLibraryBar();
}

async function loadNextArchive({ render = true } = {}) {
  if (state.archiveLoading) return false;
  const file = state.archiveFiles.find((candidate) => !state.loadedArchiveFiles.has(candidate));
  if (!file) return false;
  state.archiveLoading = true;
  try {
    const payload = await fetchJSON(archiveUrl(file));
    state.loadedArchiveFiles.add(file);
    mergeArchiveItems(payload.items || []);
    if (render) extendFeedAfterArchive();
    return true;
  } catch {
    toast('更早消息暂时加载失败，请稍后再试', 'err');
    return false;
  } finally { state.archiveLoading = false; }
}

async function loadAllArchives() {
  let loaded = false;
  while (hasMoreArchives()) {
    const ok = await loadNextArchive({ render: false });
    if (!ok) break;
    loaded = true;
  }
  return loaded;
}

async function loadData(isRefresh = false) {
  let freshStatus = null;
  // 后台数据约 15 分钟才生成一版。普通刷新先读取小状态文件，版本未变就不再下载、解析和重建整份消息。
  if (isRefresh && state.items.length > 0 && state.status?.updated_at) {
    try {
      freshStatus = await fetchJSON(STATUS_URL);
      if (freshStatus.updated_at && freshStatus.updated_at === state.status.updated_at) {
        $('#updated-at').textContent = `更新于 ${relTime(state.generatedAt)}`;
        return;
      }
    } catch { /* 状态检查失败时继续读取完整数据，避免漏掉真实更新 */ }
  }
  let data;
  try {
    data = await fetchInitialData();
    state.isDemo = false;
  } catch {
    // 拉取失败：已有真实数据就保持现状、静默等下一轮。
    // 绝不用演示数据覆盖真实数据、也绝不虚报"新消息"（这正是之前"↑10条"假象的根源）。
    if (state.items.length > 0 || isRefresh) return;
    // 仅在首次加载且从未成功过时，才显示演示占位
    data = { generated_at: new Date().toISOString(), twitter_enabled: false, items: mockItems() };
    state.isDemo = true;
  }
  $('#demo-banner').hidden = !state.isDemo;
  $('#twitter-banner').hidden = state.isDemo || data.twitter_enabled !== false;

  const incomingItems = data.items || [];
  const hadSeenItems = state.seenIds.size > 0;
  const freshItems = incomingItems.filter((it) => !state.seenIds.has(it.id));
  const freshIds = freshItems.map((it) => it.id);
  if (isRefresh && freshIds.length > 0 && hadSeenItems) {
    freshIds.forEach((id) => state.newIds.add(id));
    state.pendingNew = state.newIds.size;   // 用集合大小，不累加，避免虚高
    showNewPill();
  }
  for (const it of incomingItems) state.seenIds.add(it.id);

  state.items = incomingItems;
  state.totalItems = Math.max(incomingItems.length, Number(data.total_items || incomingItems.length));
  state.archiveFiles = Array.isArray(data.archive_files)
    ? data.archive_files.filter((file) => /^items-archive-\d+\.json$/.test(String(file)))
    : [];
  state.loadedArchiveFiles = new Set();
  state.archiveLoading = false;
  if (isRefresh) reactionLiveLoaded.clear();
  state.generatedAt = data.generated_at;
  state.twitterEnabled = data.twitter_enabled;
  state.focusTargets = data.focus_targets || [];
  state.sourceCatalog = data.sources || [];
  if (isRefresh && freshItems.length > 0 && hadSeenItems) notifyFollowedPlayers(freshItems);
  prepareRequestedMessageView();
  $('#updated-at').textContent = `更新于 ${relTime(data.generated_at)}`;

  buildSourceMenu();
  render();

  // 雷达数据文件很小，但仍放到主消息流渲染之后异步读取，不增加首屏等待时间。
  fetchJSON(CHELSEA_WATCH_URL).then((payload) => {
    state.chelseaWatchItems = Array.isArray(payload.items) ? payload.items : [];
    state.chelseaWatchGeneratedAt = payload.generated_at || null;
    state.chelseaWatchLoaded = true;
    renderFocusZone();
  }).catch(() => {
    state.chelseaWatchLoaded = true;
    renderFocusZone();
  });

  const sharedId = requestedMessageId();
  if (sharedId && !state.items.some((item) => itemId(item) === sharedId) && hasMoreArchives()) {
    loadAllArchives().then((loaded) => {
      if (!loaded || !state.items.some((item) => itemId(item) === sharedId)) return;
      prepareRequestedMessageView();
      render();
    });
  }

  const applyStatus = (s) => {
    state.status = s;
    buildSourceMenu();
    updateSrcBtn();
    renderStatusDot();
  };
  if (freshStatus) applyStatus(freshStatus);
  else fetchJSON(STATUS_URL).then(applyStatus).catch(() => {});
}

// ---------------- 筛选 ----------------
function currentSourceKeys() {
  const byKey = new Map(state.items.map((it) => [it.source_key, it]));
  const configuredSources = [...(state.sourceCatalog || []), ...(state.status?.sources || [])];
  for (const src of configuredSources) {
    if (!TIER_CLASS[src.tier] || byKey.has(src.key)) continue;
    byKey.set(src.key, {
      source_key: src.key,
      source_name: src.name,
      source_name_zh: src.name_zh || src.name,
      tier: src.tier,
    });
  }
  return [...byKey.values()]
    .sort((a, b) => (a.tier > b.tier ? 1 : -1));
}
function passFilter(it) {
  const f = state.filters;
  if (f.sources && !f.sources.includes(it.source_key)) return false;
  if (f.libraryView === 'unread' && state.library.read.has(itemId(it))) return false;
  if (f.libraryView === 'favorites' && !state.library.favorites.has(itemId(it))) return false;
  if (f.search) {
    const focusTerms = (it.focus || []).flatMap((key) => {
      const target = (state.focusTargets || []).find((item) => item.key === key);
      return target ? [target.name, target.name_zh, target.desc_zh] : [];
    }).filter(Boolean).join(' ');
    const hay = `${it.text || ''} ${it.text_zh || ''} ${it.source_name} ${it.source_name_zh || ''} ${focusTerms}`.toLowerCase();
    if (!hay.includes(f.search.toLowerCase())) return false;
  }
  return true;
}

// ---------------- 渲染 ----------------
function render() {
  clearTimeout(searchRenderTimer);
  searchRenderTimer = null;
  renderFocusZone();
  updateLibraryBar();
  renderFeed();
  requestAnimationFrame(() => requestAnimationFrame(revealRequestedMessage));
}

function updateFeedSummary() {
  // 选了中文/双语但一条译文都没有 → 提示需要配置翻译密钥
  const anyZh = state.items.some((it) => it.text_zh);
  $('#translate-banner').hidden = state.isDemo || anyZh || state.items.length === 0 || state.filters.lang === 'en';
}

function stopFeedObserver() {
  feedObserver?.disconnect();
  feedObserver = null;
}

function renderFeed() {
  stopFeedObserver();
  feedGeneration++;
  const feed = $('#feed');
  clearEngagementWatchers(feed);
  feed.textContent = '';
  feedItems = currentFilteredFeedItems();
  const sharedId = requestedMessageId();
  const sharedIndex = sharedId ? feedItems.findIndex((it) => itemId(it) === sharedId) : -1;
  feedCursor = 0;
  feedLastDay = null;
  feedAppending = false;
  feed.dataset.total = String(feedItems.length);
  feed.dataset.rendered = '0';
  updateFeedSummary();

  if (feedItems.length === 0) {
    const emptyText = state.filters.libraryView === 'favorites'
      ? '还没有收藏消息，点击卡片上的“☆ 收藏”即可加入'
      : state.filters.libraryView === 'unread'
        ? '当前没有未读消息'
        : '没有符合筛选条件的消息';
    feed.appendChild(el('div', 'empty', emptyText));
    if (hasMoreArchives()) appendArchiveControl();
    return;
  }
  appendNextFeedBatch(sharedIndex);
}

function currentFilteredFeedItems() {
  const pinned = pinnedStripItems();
  const pinnedIds = shouldShowPinnedStrip(pinned)
    ? new Set(pinned.slice(0, PINNED_RUMOR_LIMIT).map(itemId))
    : null;
  return state.items.filter(passFilter).filter((it) => !pinnedIds?.has(itemId(it)));
}

function appendArchiveControl() {
  const feed = $('#feed');
  $('#feed-more')?.remove();
  $('#feed-end')?.remove();
  const more = el('button', 'feed-more', `继续加载更早消息 · 已载入 ${state.items.length}/${state.totalItems}`);
  more.id = 'feed-more';
  more.type = 'button';
  more.onclick = async () => {
    if (state.archiveLoading) return;
    more.disabled = true;
    more.textContent = '正在加载更早消息…';
    const loaded = await loadNextArchive();
    if (!loaded && more.isConnected) {
      more.disabled = false;
      more.textContent = '重新加载更早消息';
    }
  };
  feed.appendChild(more);
  if ('IntersectionObserver' in window) {
    const generation = feedGeneration;
    feedObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      stopFeedObserver();
      if (generation === feedGeneration) more.click();
    }, { rootMargin: '500px 0px' });
    feedObserver.observe(more);
  }
}

function extendFeedAfterArchive() {
  const previousCursor = feedCursor;
  const previousLength = feedItems.length;
  feedItems = currentFilteredFeedItems();
  $('#feed').dataset.total = String(feedItems.length);
  if (feedItems.length > 0) $('#feed .empty')?.remove();
  if (previousCursor <= previousLength && feedItems.length >= previousCursor) {
    feedCursor = previousCursor;
    appendNextFeedBatch();
    if (feedCursor >= feedItems.length && hasMoreArchives()) appendArchiveControl();
    return;
  }
  renderFeed();
}

function appendNextFeedBatch(requestedIndex = -1) {
  if (feedAppending || feedCursor >= feedItems.length) return;
  feedAppending = true;
  stopFeedObserver();
  $('#feed-more')?.remove();
  $('#feed-end')?.remove();

  const feed = $('#feed');
  const fragment = document.createDocumentFragment();
  const requestedEnd = Number.isInteger(requestedIndex) ? requestedIndex + 1 : 0;
  const end = Math.min(Math.max(feedCursor + FEED_BATCH_SIZE, requestedEnd), feedItems.length);
  for (let i = feedCursor; i < end; i++) {
    const it = feedItems[i];
    const dk = dayKey(it.published_at);
    if (dk !== feedLastDay) {
      fragment.appendChild(el('div', 'day-sep', dayLabel(it.published_at)));
      feedLastDay = dk;
    }
    fragment.appendChild(renderCard(it));
  }
  feedCursor = end;
  feed.dataset.rendered = String(feedCursor);
  feed.appendChild(fragment);
  feedAppending = false;

  if (feedCursor >= feedItems.length) {
    if (hasMoreArchives()) {
      appendArchiveControl();
      return;
    }
    if (feedItems.length > FEED_BATCH_SIZE) {
      const endNote = el('div', 'feed-end', `已加载全部 ${feedItems.length} 条`);
      endNote.id = 'feed-end';
      feed.appendChild(endNote);
    }
    return;
  }

  const more = el('button', 'feed-more', `继续加载 · 已显示 ${feedCursor}/${feedItems.length}`);
  more.id = 'feed-more';
  more.type = 'button';
  more.onclick = appendNextFeedBatch;
  feed.appendChild(more);
  if ('IntersectionObserver' in window) {
    const generation = feedGeneration;
    feedObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      stopFeedObserver();
      requestAnimationFrame(() => {
        if (generation === feedGeneration) appendNextFeedBatch();
      });
    }, { rootMargin: '500px 0px' });
    feedObserver.observe(more);
  }
}

function scheduleSearchRender() {
  clearTimeout(searchRenderTimer);
  searchRenderTimer = setTimeout(async () => {
    searchRenderTimer = null;
    const query = state.filters.search;
    if (query && hasMoreArchives()) await loadAllArchives();
    if (query !== state.filters.search) {
      scheduleSearchRender();
      return;
    }
    renderFocusZone();
    renderFeed();
  }, SEARCH_DEBOUNCE_MS);
}

// ---------------- 重点传闻置顶横滑栏 ----------------
function pinnedStripItems() {
  const targetKeys = new Set((state.focusTargets || []).map((target) => target.key));
  if (targetKeys.size === 0) return [];
  const items = state.items
    .filter((it) => (it.focus || []).some((key) => targetKeys.has(key)))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  return items;
}

function shouldShowPinnedStrip(items = pinnedStripItems()) {
  const f = state.filters;
  return FOCUS_RUMOR_STRIP_ENABLED
    && items.length > 0
    && !state.isDemo
    && f.libraryView === 'all'
    && !f.search
    && f.sources === null;
}

function appendPinnedText(card, it) {
  const zh = it.text_zh || it.text || '';
  const en = it.text || it.text_zh || '';
  if (state.filters.lang === 'en') {
    card.appendChild(el('div', 'pinned-text en', en));
    return;
  }
  card.appendChild(el('div', 'pinned-text', zh));
  if (state.filters.lang === 'both' && it.text_zh && it.text) {
    card.appendChild(el('div', 'pinned-text secondary', en));
  }
}

let activeSurveyId = '';
let surveyInviteTimer = null;
let surveyInviteHandled = false;
let scoutReportInviteTimer = null;
let scoutReportInviteHandled = false;

function acknowledgeSurveyInvite(pollId = SURVEY_POPUP_ID) {
  if (pollId === SCOUT_REPORT_POPUP_ID) {
    scoutReportInviteHandled = true;
    clearTimeout(scoutReportInviteTimer);
    try { localStorage.setItem(SCOUT_REPORT_INVITE_KEY, String(Date.now())); }
    catch { /* 禁用本机存储时，本次访问内不再重复弹出 */ }
    return;
  }
  if (pollId !== SURVEY_POPUP_ID) return;
  surveyInviteHandled = true;
  clearTimeout(surveyInviteTimer);
  try { localStorage.setItem(SURVEY_INVITE_KEY, String(Date.now())); }
  catch { /* 禁用本机存储时，本次访问内不再重复弹出 */ }
}

function scheduleSurveyInvite(delay = SURVEY_INVITE_DELAY_MS) {
  const inviteDefinition = SURVEY_DEFINITIONS[SURVEY_POPUP_ID];
  if (surveyInviteHandled || !inviteDefinition || (inviteDefinition.closesAt && Date.now() >= inviteDefinition.closesAt)) return;
  try {
    const lastShownAt = Number(localStorage.getItem(SURVEY_INVITE_KEY) || 0);
    if (Number.isFinite(lastShownAt) && lastShownAt > 0 && Date.now() - lastShownAt < SURVEY_INVITE_INTERVAL_MS) {
      surveyInviteHandled = true;
      return;
    }
  } catch { /* 本机存储不可用时仍可展示一次 */ }
  clearTimeout(surveyInviteTimer);
  surveyInviteTimer = setTimeout(() => {
    if (document.hidden || document.querySelector('.modal:not([hidden]), .comment-overlay, .survey-overlay')) {
      scheduleSurveyInvite(1200);
      return;
    }
    acknowledgeSurveyInvite(SURVEY_POPUP_ID);
    openSurvey(SURVEY_POPUP_ID);
  }, delay);
}

function scheduleScoutReportInvite(delay = SCOUT_REPORT_INVITE_DELAY_MS) {
  if (scoutReportInviteHandled || !SURVEY_DEFINITIONS[SCOUT_REPORT_POPUP_ID]) return;
  try {
    const lastShownAt = Number(localStorage.getItem(SCOUT_REPORT_INVITE_KEY) || 0);
    if (Number.isFinite(lastShownAt) && lastShownAt > 0 && Date.now() - lastShownAt < SCOUT_REPORT_INVITE_INTERVAL_MS) {
      scoutReportInviteHandled = true;
      return;
    }
  } catch { /* 本机存储不可用时仍可展示一次 */ }
  clearTimeout(scoutReportInviteTimer);
  scoutReportInviteTimer = setTimeout(() => {
    if (document.hidden) {
      scheduleScoutReportInvite(1800);
      return;
    }
    if (document.querySelector('.modal:not([hidden]), .comment-overlay, .survey-overlay')) {
      // 夏窗调查或其他弹层已经出现时，本次访问不追着再弹，避免连续打扰。
      scoutReportInviteHandled = true;
      return;
    }
    acknowledgeSurveyInvite(SCOUT_REPORT_POPUP_ID);
    openSurvey(SCOUT_REPORT_POPUP_ID);
  }, delay);
}

function closeSurvey() {
  document.querySelector('.survey-overlay')?.remove();
  document.body.classList.remove('survey-open');
  activeSurveyId = '';
}

function surveyQuestionTitle(definition, question) {
  if (!question.title.includes('XX') || !definition.closesAt) return question.title;
  const days = Math.max(0, Math.ceil((definition.closesAt - Date.now()) / 86400e3));
  return question.title.replace('XX', String(days));
}

function surveyErrorText(reason) {
  if (reason === 'missing_answer') return '还有必答题没有选择，请检查后再提交';
  if (reason === 'bad_answer' || reason === 'bad_answers') return '有一项答案不符合要求，请重新选择';
  if (reason === 'slow_down') return '操作有点快，请两秒后再试';
  if (reason === 'ip_limit') return '当前网络已经产生多张选票，暂时不能继续新增；原设备仍可修改自己的选票';
  if (reason === 'closed') return '夏窗已经关闭，本次调查只保留结果查看';
  return '调查服务暂时不可用，请稍后再试';
}

async function surveyApi(pollId, method = 'GET', answers = null) {
  const endpoints = [...new Set([state.surveyEndpoint, ...SURVEY_ENDPOINTS].filter(Boolean))];
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const url = `${endpoint}?poll=${encodeURIComponent(pollId)}&voter=${encodeURIComponent(state.surveyProfile.voter)}`;
      const response = await fetch(url, {
        method,
        cache: 'no-store',
        headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
        body: method === 'POST' ? JSON.stringify({ poll: pollId, voter: state.surveyProfile.voter, answers }) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok === true) {
        state.surveyEndpoint = endpoint;
        return data;
      }
      if (response.status < 500 && data.reason) return data;
      lastError = new Error(data.reason || `HTTP ${response.status}`);
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('survey_unavailable');
}

async function featureReservationApi(featureId, method = 'GET') {
  const endpoints = [...new Set([
    state.featureReservationEndpoint,
    ...FEATURE_RESERVATION_ENDPOINTS,
  ].filter(Boolean))];
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const url = `${endpoint}?feature=${encodeURIComponent(featureId)}&voter=${encodeURIComponent(state.surveyProfile.voter)}`;
      const response = await fetch(url, {
        method,
        cache: 'no-store',
        headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
        body: method === 'POST'
          ? JSON.stringify({ feature: featureId, voter: state.surveyProfile.voter })
          : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok === true) {
        state.featureReservationEndpoint = endpoint;
        return data;
      }
      lastError = new Error(data.reason || `HTTP ${response.status}`);
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('reservation_unavailable');
}

function surveyChoiceName(pollId, questionId) {
  return `survey_${pollId}_${questionId}`;
}

function midfieldCombinationLabel(answers = {}) {
  const labels = {
    enzo: { join: '恩佐来', stay: '恩佐不来' },
    rodri: { stay: '罗德里留', leave: '罗德里走' },
    bouaddi: { join: '布阿迪今夏来', later: '布阿迪今夏不来' },
  };
  const values = [
    labels.rodri[String(answers.rodri || '')],
    labels.enzo[String(answers.enzo || '')],
    labels.bouaddi[String(answers.bouaddi || '')],
  ];
  return values.every(Boolean) ? values.join(' · ') : '';
}

function midfieldCombinationEntries(context) {
  const counts = context.data.results?.combinations?.counts || {};
  const total = Math.max(0, Number(context.data.results?.total || 0));
  const questions = Object.fromEntries(context.definition.questions.map((question) => [question.id, question]));
  const entries = [];
  for (const enzo of questions.enzo.options) {
    for (const rodri of questions.rodri.options) {
      for (const bouaddi of questions.bouaddi.options) {
        const answers = { enzo: enzo.value, rodri: rodri.value, bouaddi: bouaddi.value };
        const key = `${answers.enzo}|${answers.rodri}|${answers.bouaddi}`;
        const count = Math.max(0, Number(counts[key] || 0));
        entries.push({ key, answers, label: midfieldCombinationLabel(answers), count, percent: total ? Math.round(count / total * 100) : 0 });
      }
    }
  }
  return entries.sort((a, b) => b.count - a.count || b.percent - a.percent || a.key.localeCompare(b.key));
}

function surveyScoreBand(score) {
  if (score >= 9) return '维圣封神';
  if (score >= 7) return '有点东西';
  if (score >= 5) return '勉强及格';
  if (score >= 3) return '赶紧买人';
  return '维亚纳睡着了';
}

function coachScoreVerdict(score) {
  if (score >= 9) return '一声马来，陆地 GOAT';
  if (score >= 7) return '值得期待';
  if (score >= 5) return '勉强及格';
  if (score >= 3) return '问题不少';
  return '科研失败';
}

function surveyResultOptions(context, question, includeZero = false) {
  const total = Math.max(0, Number(context.data.results?.total || 0));
  const result = context.data.results?.questions?.[question.id];
  if (!result) return [];
  return question.options
    .map((option, order) => {
      const count = Math.max(0, Number(result.counts?.[option.value] || 0));
      return { ...option, order, count, percent: total ? Math.round((count / total) * 100) : 0 };
    })
    .filter((option) => includeZero || option.count > 0)
    .sort(includeZero ? (a, b) => a.order - b.order : (a, b) => b.count - a.count || a.order - b.order);
}

function departureSurveyAffinity(context) {
  const question = context.definition.questions.find((item) => item.id === 'departures');
  const saved = context.data.ballot?.answers?.departures;
  const selected = new Set((Array.isArray(saved) ? saved : saved == null ? [] : [saved]).map(String));
  if (!question || selected.size === 0) return null;
  const choice = surveyResultOptions(context, question, true)
    .filter((option) => selected.has(String(option.value)))
    .sort((a, b) => b.percent - a.percent || b.count - a.count || a.order - b.order)[0];
  if (!choice) return null;
  const player = String(choice.label || '').split(' → ')[0].trim() || choice.label;
  return choice.percent >= 50
    ? {
        primary: `你与${choice.percent}%的蓝月球迷共同选择了${player}。`,
        secondary: '看来这次，不是你一个人放不下。',
      }
    : {
        primary: `只有${choice.percent}%的蓝月球迷和你做出了同样的选择。`,
        secondary: '',
      };
}

function surveyShareDate(date = new Date(), withTime = true) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    }).format(date);
  } catch { return date.toLocaleString('zh-CN', { hour12: false }); }
}

function surveyShareUrl(pollId, attribution = '') {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('survey', pollId);
  if (attribution) url.searchParams.set('from', attribution);
  return url.href;
}

function requestedSurveyId() {
  try {
    const pollId = new URLSearchParams(window.location.search).get('survey') || '';
    return SURVEY_DEFINITIONS[pollId] ? pollId : '';
  } catch { return ''; }
}

function drawSurveyShareBar(ctx, x, y, width, percent, color = '#6cabdd') {
  fillRoundedCanvasRect(ctx, x, y, width, 18, 9, '#dbe9f2');
  fillRoundedCanvasRect(ctx, x, y, Math.max(percent > 0 ? 12 : 0, width * Math.min(100, percent) / 100), 18, 9, color);
}

async function buildSummerSurveyShareCard(context) {
  const total = Math.max(0, Number(context.data.results?.total || 0));
  if (!total) throw new Error('NO_SURVEY_RESULTS');
  const definition = context.definition;
  const scoreQuestion = definition.questions.find((question) => question.id === 'score');
  const positionsQuestion = definition.questions.find((question) => question.id === 'positions');
  const scoreResult = context.data.results?.questions?.score || {};
  const scoreAverage = Math.max(0, Number(scoreResult.average || 0));
  const scoreOptions = scoreQuestion ? surveyResultOptions(context, scoreQuestion, true) : [];
  const positionOptions = positionsQuestion ? surveyResultOptions(context, positionsQuestion).slice(0, 5) : [];

  const canvas = document.createElement('canvas');
  canvas.width = SURVEY_SHARE_WIDTH;
  canvas.height = SURVEY_SHARE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const background = ctx.createLinearGradient(0, 0, SURVEY_SHARE_WIDTH, SURVEY_SHARE_HEIGHT);
  background.addColorStop(0, '#061c33');
  background.addColorStop(.55, '#0b3658');
  background.addColorStop(1, '#16658d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, SURVEY_SHARE_WIDTH, SURVEY_SHARE_HEIGHT);

  ctx.save();
  ctx.globalAlpha = .22;
  ctx.strokeStyle = '#78c9f0';
  ctx.lineWidth = 70;
  ctx.beginPath();
  ctx.arc(1010, 80, 270, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const assetBase = new URL('./assets/', document.baseURI).href;
  const [crest, qr] = await Promise.all([
    loadShareCardImage(`${assetBase}man-city-crest.svg`),
    loadShareCardImage(`${assetBase}site-qr.png`),
  ]);
  ctx.drawImage(crest, 62, 50, 142, 142);
  cardFont(ctx, 28, 800);
  ctx.fillStyle = '#8dd2f2';
  ctx.fillText('曼城转会情报站', 238, 91);
  cardFont(ctx, 58, 900);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('蓝月夏窗球迷调查', 238, 158);
  cardFont(ctx, 24, 600);
  ctx.fillStyle = '#c8e7f8';
  ctx.fillText(`统计截止 ${surveyShareDate(new Date())}`, 238, 207);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.25)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  fillRoundedCanvasRect(ctx, 50, 270, 980, 1450, 34, '#f7fbfe');
  ctx.restore();

  fillRoundedCanvasRect(ctx, 86, 312, 590, 220, 26, '#0b2f50');
  cardFont(ctx, 24, 700);
  ctx.fillStyle = '#9edcf6';
  ctx.fillText('球迷夏窗平均分', 122, 360);
  cardFont(ctx, 84, 900);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(scoreAverage.toFixed(1), 120, 456);
  cardFont(ctx, 34, 800);
  ctx.fillStyle = '#8dd2f2';
  ctx.fillText('/ 10', 285, 456);
  cardFont(ctx, 29, 800);
  ctx.fillStyle = '#f2c94c';
  ctx.fillText(surveyScoreBand(scoreAverage), 420, 456);

  fillRoundedCanvasRect(ctx, 704, 312, 286, 220, 26, '#dff3ff');
  cardFont(ctx, 24, 700);
  ctx.fillStyle = '#41647c';
  ctx.fillText('有效选票', 742, 360);
  cardFont(ctx, 76, 900);
  ctx.fillStyle = '#0b2f50';
  ctx.fillText(String(total), 740, 456);
  cardFont(ctx, 24, 800);
  ctx.fillStyle = '#41647c';
  ctx.fillText('位蓝月球迷', 740, 496);

  cardFont(ctx, 30, 900);
  ctx.fillStyle = '#0b2f50';
  ctx.fillText('评分分布', 90, 590);
  const maxScoreCount = Math.max(1, ...scoreOptions.map((option) => option.count));
  const chartTop = 628;
  const chartHeight = 170;
  const columnStep = 80;
  for (let index = 0; index < scoreOptions.length; index++) {
    const option = scoreOptions[index];
    const x = 92 + index * columnStep;
    const height = Math.max(option.count > 0 ? 8 : 0, chartHeight * option.count / maxScoreCount);
    fillRoundedCanvasRect(ctx, x, chartTop, 46, chartHeight, 12, '#e2edf4');
    if (height > 0) fillRoundedCanvasRect(ctx, x, chartTop + chartHeight - height, 46, height, 12, index >= 7 ? '#6cabdd' : '#9fcbe4');
    cardFont(ctx, 19, 800);
    ctx.fillStyle = '#61798b';
    ctx.textAlign = 'center';
    ctx.fillText(String(option.value), x + 23, 829);
    if (option.count > 0) {
      cardFont(ctx, 17, 800);
      ctx.fillStyle = '#0b2f50';
      ctx.fillText(String(option.count), x + 23, chartTop + chartHeight - height - 9);
    }
  }
  ctx.textAlign = 'left';

  cardFont(ctx, 30, 900);
  ctx.fillStyle = '#0b2f50';
  ctx.fillText('最亟需补强的位置', 90, 900);
  let positionY = 940;
  for (const option of positionOptions) {
    cardFont(ctx, 23, 700);
    ctx.fillStyle = '#35566d';
    ctx.fillText(fitCanvasText(ctx, option.label, 255), 92, positionY + 24);
    drawSurveyShareBar(ctx, 350, positionY + 5, 510, option.percent, option === positionOptions[0] ? '#7a1830' : '#6cabdd');
    cardFont(ctx, 22, 900);
    ctx.fillStyle = '#0b2f50';
    ctx.textAlign = 'right';
    ctx.fillText(`${option.percent}%`, 958, positionY + 24);
    ctx.textAlign = 'left';
    positionY += 58;
  }

  cardFont(ctx, 30, 900);
  ctx.fillStyle = '#0b2f50';
  ctx.fillText('每道题的第一选择', 90, 1260);
  const insightQuestions = definition.questions.filter((question) => !['score', 'positions'].includes(question.id)).slice(0, 6);
  for (let index = 0; index < insightQuestions.length; index++) {
    const question = insightQuestions[index];
    const top = surveyResultOptions(context, question)[0];
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 88 + col * 458;
    const y = 1292 + row * 126;
    fillRoundedCanvasRect(ctx, x, y, 436, 108, 19, col === 0 ? '#eaf6fc' : '#fff5e7');
    cardFont(ctx, 19, 700);
    ctx.fillStyle = '#647d90';
    const shortTitle = surveyQuestionTitle(definition, question).replace(/^\d+\.\s*/, '');
    ctx.fillText(fitCanvasText(ctx, shortTitle, 380), x + 22, y + 33);
    cardFont(ctx, 25, 900);
    ctx.fillStyle = '#0b2f50';
    ctx.fillText(fitCanvasText(ctx, top?.label || '暂无结果', 300), x + 22, y + 76);
    if (top) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#7a1830';
      ctx.fillText(`${top.percent}%`, x + 414, y + 76);
      ctx.textAlign = 'left';
    }
  }

  const footer = ctx.createLinearGradient(0, 1760, SURVEY_SHARE_WIDTH, SURVEY_SHARE_HEIGHT);
  footer.addColorStop(0, '#8dd2f2');
  footer.addColorStop(1, '#6cabdd');
  ctx.fillStyle = footer;
  ctx.fillRect(0, 1760, SURVEY_SHARE_WIDTH, 160);
  cardFont(ctx, 30, 900);
  ctx.fillStyle = '#071d34';
  ctx.fillText('看看你的观点是不是蓝月主流', 60, 1814);
  cardFont(ctx, 22, 800);
  ctx.fillText('adolfcns.github.io/city-transfer-hub/', 60, 1862);
  fillRoundedCanvasRect(ctx, 890, 1777, 126, 126, 14, '#ffffff');
  ctx.drawImage(qr, 899, 1786, 108, 108);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG_EXPORT_FAILED')), 'image/png', .96);
  });
}

async function buildDepartureSurveyShareCard(context) {
  const total = Math.max(0, Number(context.data.results?.total || 0));
  if (!total) throw new Error('NO_SURVEY_RESULTS');
  const question = context.definition.questions.find((item) => item.id === 'departures');
  const options = surveyResultOptions(context, question, true)
    .sort((a, b) => b.count - a.count || a.order - b.order);
  const cardHeight = 1640;
  const canvas = document.createElement('canvas');
  canvas.width = SURVEY_SHARE_WIDTH;
  canvas.height = cardHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const background = ctx.createLinearGradient(0, 0, SURVEY_SHARE_WIDTH, cardHeight);
  background.addColorStop(0, '#061c33');
  background.addColorStop(.58, '#0b3658');
  background.addColorStop(1, '#16658d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, SURVEY_SHARE_WIDTH, cardHeight);

  ctx.save();
  ctx.globalAlpha = .18;
  ctx.strokeStyle = '#78c9f0';
  ctx.lineWidth = 72;
  ctx.beginPath();
  ctx.arc(1015, 60, 260, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  cardFont(ctx, 24, 900);
  ctx.fillStyle = '#8dd2f2';
  ctx.fillText('夏窗收尾 · 蓝月球迷实时选择', 58, 70);
  cardFont(ctx, 58, 900);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('谁最让你意难平？', 58, 142);
  cardFont(ctx, 23, 700);
  ctx.fillStyle = '#c8e7f8';
  ctx.fillText(`${total} 份有效选票 · 每人最多选 3 人 · 统计截止 ${surveyShareDate(new Date())}`, 58, 195);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.24)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 12;
  fillRoundedCanvasRect(ctx, 48, 245, 984, 1225, 34, '#f7fbfe');
  ctx.restore();

  cardFont(ctx, 23, 800);
  ctx.fillStyle = '#567286';
  ctx.fillText('实时排名', 84, 305);
  ctx.textAlign = 'right';
  ctx.fillText('支持率 · 票数', 994, 305);
  ctx.textAlign = 'left';

  const barX = 405;
  const barWidth = 410;
  const rowStart = 338;
  const rowStep = 106;
  options.forEach((option, index) => {
    const y = rowStart + index * rowStep;
    if (index > 0) {
      ctx.strokeStyle = '#dce8f0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(84, y - 20);
      ctx.lineTo(994, y - 20);
      ctx.stroke();
    }
    fillRoundedCanvasRect(ctx, 84, y + 1, 46, 46, 14, index < 3 ? '#0b3658' : '#e2eff6');
    cardFont(ctx, 22, 900);
    ctx.fillStyle = index < 3 ? '#ffffff' : '#41647c';
    ctx.textAlign = 'center';
    ctx.fillText(String(index + 1), 107, y + 32);
    ctx.textAlign = 'left';

    cardFont(ctx, 23, 850);
    ctx.fillStyle = '#0b2f50';
    ctx.fillText(fitCanvasText(ctx, option.label, 245), 148, y + 31);
    drawSurveyShareBar(ctx, barX, y + 14, barWidth, option.percent, index === 0 ? '#a83a57' : index < 3 ? '#3b9ed2' : '#79bddd');
    cardFont(ctx, 21, 900);
    ctx.fillStyle = index === 0 ? '#7a1830' : '#0b2f50';
    ctx.textAlign = 'right';
    ctx.fillText(`${option.percent}% · ${option.count}票`, 994, y + 33);
    ctx.textAlign = 'left';
  });

  cardFont(ctx, 30, 900);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('曼城转会情报站', SURVEY_SHARE_WIDTH / 2, 1552);
  cardFont(ctx, 20, 700);
  ctx.fillStyle = '#9edcf6';
  ctx.fillText('记录蓝月球迷共同的不舍', SURVEY_SHARE_WIDTH / 2, 1592);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG_EXPORT_FAILED')), 'image/png', .96);
  });
}

async function buildCoachSurveyShareCard(context) {
  const total = Math.max(0, Number(context.data.results?.total || 0));
  if (!total) throw new Error('NO_SURVEY_RESULTS');
  const definition = context.definition;
  const scoreQuestion = definition.questions.find((question) => question.id === 'score');
  const detailQuestions = definition.questions.filter((question) => question.id !== 'score');
  const average = Math.max(0, Math.min(10, Number(context.data.results?.questions?.score?.average || 0)));
  const scoreOptions = surveyResultOptions(context, scoreQuestion, true);
  const cardHeight = 2480;

  const canvas = document.createElement('canvas');
  canvas.width = SURVEY_SHARE_WIDTH;
  canvas.height = cardHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const background = ctx.createLinearGradient(0, 0, SURVEY_SHARE_WIDTH, cardHeight);
  background.addColorStop(0, '#061c33');
  background.addColorStop(.55, '#0b3658');
  background.addColorStop(1, '#16658d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, SURVEY_SHARE_WIDTH, cardHeight);

  ctx.save();
  ctx.globalAlpha = .22;
  ctx.strokeStyle = '#78c9f0';
  ctx.lineWidth = 70;
  ctx.beginPath();
  ctx.arc(1010, 80, 270, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const assetBase = new URL('./assets/', document.baseURI).href;
  const [crest, qr] = await Promise.all([
    loadShareCardImage(`${assetBase}man-city-crest.svg`),
    loadShareCardImage(`${assetBase}site-qr.png`),
  ]);
  ctx.drawImage(crest, 62, 50, 142, 142);
  cardFont(ctx, 28, 800);
  ctx.fillStyle = '#8dd2f2';
  ctx.fillText('曼城转会情报站', 238, 91);
  cardFont(ctx, 56, 900);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('马雷斯卡英超首秀评分', 238, 158);
  cardFont(ctx, 24, 600);
  ctx.fillStyle = '#c8e7f8';
  ctx.fillText(`统计截止 ${surveyShareDate(new Date())}`, 238, 207);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.25)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  fillRoundedCanvasRect(ctx, 50, 270, 980, 2020, 34, '#f7fbfe');
  ctx.restore();

  fillRoundedCanvasRect(ctx, 86, 312, 590, 220, 26, '#0b2f50');
  cardFont(ctx, 24, 700);
  ctx.fillStyle = '#9edcf6';
  ctx.fillText('英超首秀平均分', 122, 360);
  cardFont(ctx, 84, 900);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(average.toFixed(1), 120, 456);
  cardFont(ctx, 34, 800);
  ctx.fillStyle = '#8dd2f2';
  ctx.fillText('/ 10', 285, 456);
  cardFont(ctx, 29, 800);
  ctx.fillStyle = '#f2c94c';
  ctx.fillText(fitCanvasText(ctx, coachScoreVerdict(average), 245), 420, 456);

  fillRoundedCanvasRect(ctx, 704, 312, 286, 220, 26, '#dff3ff');
  cardFont(ctx, 24, 700);
  ctx.fillStyle = '#41647c';
  ctx.fillText('有效选票', 742, 360);
  cardFont(ctx, 76, 900);
  ctx.fillStyle = '#0b2f50';
  ctx.fillText(String(total), 740, 456);
  cardFont(ctx, 24, 800);
  ctx.fillStyle = '#41647c';
  ctx.fillText('位蓝月球迷', 740, 496);

  cardFont(ctx, 30, 900);
  ctx.fillStyle = '#0b2f50';
  ctx.fillText('问题一：0—10 分完整分布', 90, 590);
  const maxScoreCount = Math.max(1, ...scoreOptions.map((option) => option.count));
  const chartTop = 628;
  const chartHeight = 170;
  const columnStep = 80;
  for (let index = 0; index < scoreOptions.length; index++) {
    const option = scoreOptions[index];
    const x = 92 + index * columnStep;
    const height = Math.max(option.count > 0 ? 8 : 0, chartHeight * option.count / maxScoreCount);
    fillRoundedCanvasRect(ctx, x, chartTop, 46, chartHeight, 12, '#e2edf4');
    if (height > 0) fillRoundedCanvasRect(ctx, x, chartTop + chartHeight - height, 46, height, 12, index >= 5 ? '#6cabdd' : '#a83a57');
    cardFont(ctx, 19, 800);
    ctx.fillStyle = '#61798b';
    ctx.textAlign = 'center';
    ctx.fillText(String(option.value), x + 23, 829);
    if (option.count > 0) {
      cardFont(ctx, 17, 800);
      ctx.fillStyle = '#0b2f50';
      ctx.fillText(String(option.count), x + 23, chartTop + chartHeight - height - 9);
    }
  }
  ctx.textAlign = 'left';

  const drawRanking = (question, startY) => {
    const options = surveyResultOptions(context, question, true);
    cardFont(ctx, 27, 900);
    ctx.fillStyle = '#0b2f50';
    ctx.fillText(fitCanvasText(ctx, question.title, 870), 90, startY);
    if (question.type === 'multi') {
      cardFont(ctx, 18, 700);
      ctx.fillStyle = '#6b8191';
      ctx.textAlign = 'right';
      ctx.fillText('最多选两项', 960, startY);
      ctx.textAlign = 'left';
    }
    options.forEach((option, index) => {
      const y = startY + 34 + index * 49;
      cardFont(ctx, 19, 700);
      ctx.fillStyle = '#35566d';
      ctx.fillText(fitCanvasText(ctx, option.label, 345), 92, y + 20);
      drawSurveyShareBar(ctx, 465, y + 4, 350, option.percent, index === 0 ? '#7a1830' : '#6cabdd');
      cardFont(ctx, 18, 900);
      ctx.fillStyle = '#0b2f50';
      ctx.textAlign = 'right';
      ctx.fillText(`${option.percent}% · ${option.count}票`, 960, y + 20);
      ctx.textAlign = 'left';
    });
  };
  const rankingStarts = [900, 1180, 1460, 1900];
  detailQuestions.forEach((question, index) => drawRanking(question, rankingStarts[index]));

  const footer = ctx.createLinearGradient(0, 2320, SURVEY_SHARE_WIDTH, cardHeight);
  footer.addColorStop(0, '#8dd2f2');
  footer.addColorStop(1, '#6cabdd');
  ctx.fillStyle = footer;
  ctx.fillRect(0, 2320, SURVEY_SHARE_WIDTH, 160);
  cardFont(ctx, 30, 900);
  ctx.fillStyle = '#071d34';
  ctx.fillText('来给马雷斯卡的英超首秀打个分', 60, 2374);
  cardFont(ctx, 22, 800);
  ctx.fillText('adolfcns.github.io/city-transfer-hub/', 60, 2422);
  fillRoundedCanvasRect(ctx, 890, 2337, 126, 126, 14, '#ffffff');
  ctx.drawImage(qr, 899, 2346, 108, 108);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG_EXPORT_FAILED')), 'image/png', .96);
  });
}

async function downloadCoachSurveyResults(context) {
  if (shareCardInFlight) {
    toast('统计图正在生成，请稍候');
    return;
  }
  shareCardInFlight = true;
  toast('正在同步最新票数并生成统计图…');
  try {
    const fresh = await surveyApi(context.pollId);
    if (!fresh?.results?.total) throw new Error('NO_SURVEY_RESULTS');
    context.data = fresh;
    const blob = await buildCoachSurveyShareCard(context);
    const filename = `马雷斯卡英超首秀评分-${surveyShareDate(new Date(), false).replace(/[\s年月日]/g, '-')}.png`;
    showShareCardSavePreview(blob, filename, {
      title: '马雷斯卡英超首秀评分长图',
      hint: '五个问题的实时统计已经汇总。点击保存；手机浏览器不支持直接保存时，也可以长按图片存入相册。',
      alt: '马雷斯卡英超首秀五题投票实时统计图',
      downloadLabel: '↓ 保存统计图',
    });
    toast('五题统计图已生成 ✓');
  } catch {
    toast('实时结果暂时无法同步，请稍后再试', 'err');
  } finally {
    shareCardInFlight = false;
    if (activeSurveyId === context.pollId) renderSurveyResults(context);
  }
}

async function shareDepartureSurveyLink(context) {
  const link = surveyShareUrl(context.pollId, SHARE_ATTRIBUTION_KEY);
  if (navigator.share) {
    try {
      await navigator.share({
        title: '夏窗收尾｜谁最让你意难平？',
        text: '这个夏天，谁的离队最让你意难平？最多选 3 人，看看蓝月球迷怎么选。',
        url: link,
      });
      void recordShareEvent('native_share', context.pollId);
      toast('投票链接已分享 ✓');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        toast('已取消分享');
        return;
      }
    }
  }
  const copied = await copyText(link);
  if (copied) void recordShareEvent('copy_link', context.pollId);
  toast(copied ? '投票链接已复制 ✓' : '链接复制失败，请稍后再试', copied ? undefined : 'err');
}

async function downloadDepartureSurveyResults(context) {
  if (shareCardInFlight) {
    toast('统计图正在生成，请稍候');
    return;
  }
  shareCardInFlight = true;
  toast('正在同步最新票数并生成无二维码统计图…');
  try {
    const fresh = await surveyApi(context.pollId);
    if (!fresh?.results?.total) throw new Error('NO_SURVEY_RESULTS');
    context.data = fresh;
    const blob = await buildDepartureSurveyShareCard(context);
    const filename = `曼城夏窗意难平榜-${surveyShareDate(new Date(), false).replace(/[\s年月日]/g, '-')}.png`;
    showShareCardSavePreview(blob, filename, {
      title: '夏窗意难平实时统计图',
      hint: '图片不含二维码和网址，可直接保存后分享到懂球帝等平台。',
      alt: '曼城夏窗离队意难平投票实时统计图',
      downloadLabel: '↓ 保存统计图',
      onDownload: () => recordShareEvent('save_image', context.pollId),
    });
    toast('无二维码统计图已生成 ✓');
  } catch {
    toast('实时结果暂时无法同步，请稍后再试', 'err');
  } finally {
    shareCardInFlight = false;
    if (activeSurveyId === context.pollId) renderSurveyResults(context);
  }
}

async function shareSummerSurveyResults(context) {
  if (shareCardInFlight) {
    toast('统计图正在生成，请稍候');
    return;
  }
  shareCardInFlight = true;
  toast('正在同步最新票数并生成统计图…');
  try {
    const fresh = await surveyApi(context.pollId);
    if (!fresh?.results?.total) throw new Error('NO_SURVEY_RESULTS');
    context.data = fresh;
    const blob = await buildSummerSurveyShareCard(context);
    const filename = `曼城夏窗调查-${surveyShareDate(new Date(), false).replace(/[\s年月日]/g, '-')}.png`;
    const link = surveyShareUrl(context.pollId);
    const shareLink = async () => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: '曼城夏窗球迷调查',
            text: '把这份蓝月风向分享给球迷朋友，喊他们也来投一票，看看你们是不是同一派 💙',
            url: link,
          });
          toast('调查链接已分享 ✓');
          return true;
        } catch (error) {
          if (error?.name === 'AbortError') {
            toast('已取消分享');
            return false;
          }
        }
      }
      if (await copyText(link)) {
        toast('调查链接已复制 ✓');
        return true;
      }
      toast('链接复制失败，请稍后再试', 'err');
      return false;
    };
    showShareCardSavePreview(blob, filename, {
      title: '夏窗调查统计长图',
      hint: '把这份蓝月风向分享给球迷朋友，喊他们也来投一票，看看你们是不是同一派 💙',
      alt: '截至当前日期的曼城夏窗调查统计长图',
      downloadLabel: '↓ 保存长图',
      shareLabel: '↗ 分享链接',
      onShare: shareLink,
    });
    toast('统计长图已生成 ✓');
  } catch {
    toast('实时结果暂时无法同步，请稍后再试', 'err');
  } finally {
    shareCardInFlight = false;
    if (activeSurveyId === context.pollId) renderSurveyResults(context);
  }
}

function renderScoutReport(context) {
  const { body, definition } = context;
  body.textContent = '';
  body.dataset.surveyView = 'report';
  const report = el('article', 'scout-report');
  const toolbar = el('div', 'scout-report-toolbar');
  const back = el('button', 'survey-back', '← 报告简介');
  back.type = 'button';
  back.onclick = () => renderSurveyIntro(context);
  const share = el('button', 'survey-secondary scout-report-share', '复制报告链接');
  share.type = 'button';
  share.onclick = async () => {
    if (await copyText(surveyShareUrl(context.pollId))) toast('阿兰球探报告链接已复制 ✓');
    else toast('链接复制失败，请稍后再试', 'err');
  };
  toolbar.append(back, el('span', 'scout-report-read-time', '4 张图 · 约 1 分钟'), share);
  report.appendChild(toolbar);
  const summary = el('section', 'scout-report-summary');
  summary.append(
    el('span', 'scout-report-kicker', 'ALLAN · 22岁 · 左脚右路'),
    el('h3', null, '专项能力上游，整体进攻画像仍待补全'),
    el('p', null, '曼城看中的不是一名已经稳定兑现产量的成品，而是左脚右路的一对一突破、纵向推进和翼卫兼容性。'),
  );
  report.appendChild(summary);
  for (const item of definition.reportImages || []) {
    const figure = el('figure', 'scout-report-figure');
    figure.appendChild(el('h3', null, item.title));
    const link = el('a', 'scout-report-image-link');
    link.href = item.src;
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = '点击查看原尺寸图片';
    const image = document.createElement('img');
    image.src = item.src;
    image.alt = item.title;
    image.loading = 'lazy';
    image.decoding = 'async';
    link.appendChild(image);
    figure.append(link, el('figcaption', null, item.caption));
    report.appendChild(figure);
  }
  const note = el('aside', 'scout-report-note');
  note.append(
    el('strong', null, '数据口径'),
    el('span', null, 'Allan 为 2026 巴甲；其他球员为 2025/26 五大联赛。仅统计联赛并统一换算为每90分钟；Savinho 仅 821 分钟，属于小样本。'),
  );
  report.appendChild(note);
  body.appendChild(report);
  body.scrollTop = 0;
}

function renderSurveyIntro(context) {
  const { body, definition, data } = context;
  body.textContent = '';
  body.dataset.surveyView = 'intro';
  const intro = el('div', 'survey-intro');
  intro.appendChild(el('div', 'survey-intro-icon', definition.icon || (context.pollId === 'summer_2026' ? '📊' : '💬')));
  if (definition.introHeadline) {
    const headline = el('strong', 'survey-intro-headline');
    const emphasis = definition.introEmphasis;
    const emphasisAt = emphasis ? definition.introHeadline.indexOf(emphasis) : -1;
    if (emphasisAt >= 0) {
      headline.classList.add('has-emphasis');
      headline.append(
        document.createTextNode(definition.introHeadline.slice(0, emphasisAt)),
        el('span', 'survey-intro-emphasis', emphasis),
        document.createTextNode(definition.introHeadline.slice(emphasisAt + emphasis.length)),
      );
    } else {
      headline.textContent = definition.introHeadline;
    }
    intro.appendChild(headline);
  }
  if (definition.introQuestion) intro.appendChild(el('strong', 'survey-intro-question', definition.introQuestion));
  const introCopy = data.ballot && definition.returningIntro
    ? definition.returningIntro
    : definition.intro;
  if (introCopy) intro.appendChild(el('p', 'survey-intro-copy', introCopy));
  if (definition.reportOnly) {
    intro.classList.add('scout-report-invite');
    const stats = el('div', 'scout-intro-stats');
    for (const item of definition.introHighlights || []) {
      const stat = el('div', 'scout-intro-stat');
      stat.append(el('strong', null, item.value), el('span', null, item.label));
      stats.appendChild(stat);
    }
    intro.appendChild(stats);
    const actions = el('div', 'survey-intro-actions');
    const start = el('button', 'survey-primary', definition.primaryLabel || '查看报告');
    start.type = 'button';
    start.onclick = () => renderScoutReport(context);
    const later = el('button', 'survey-secondary', '稍后再看');
    later.type = 'button';
    later.onclick = closeSurvey;
    actions.append(start, later);
    intro.appendChild(actions);
    body.appendChild(intro);
    return;
  }
  if (definition.announcementOnly) {
    const previewGrid = el('div', 'survey-preview-grid');
    for (const item of definition.previewItems || []) previewGrid.appendChild(el('span', 'survey-preview-item', item));
    intro.appendChild(previewGrid);
    if (definition.previewNote) intro.appendChild(el('p', 'survey-preview-note', definition.previewNote));
    const reservation = data.reservation || {
      count: Number(definition.reservationBase || 0),
      reserved: false,
      loading: false,
    };
    if (definition.reservationFeature) {
      const count = Math.max(Number(definition.reservationBase || 0), Number(reservation.count || 0));
      const status = el('p', 'feature-reservation-status', `全站已有 ${count.toLocaleString('zh-CN')} 人预约关注`);
      if (reservation.reserved) status.appendChild(el('strong', 'feature-reservation-mine', ' · 其中有你 ✓'));
      intro.appendChild(status);
    }
    const actions = el('div', 'survey-intro-actions single');
    const ok = el('button', 'survey-primary', data.reservationPending
      ? '正在预约…'
      : reservation.reserved
        ? (definition.reservedLabel || '✓ 已预约')
        : (definition.primaryLabel || '知道了'));
    ok.type = 'button';
    ok.disabled = Boolean(data.reservationPending || reservation.reserved);
    ok.onclick = async () => {
      if (!definition.reservationFeature) {
        closeSurvey();
        return;
      }
      context.data = { ...context.data, reservationPending: true };
      renderSurveyIntro(context);
      try {
        const result = await featureReservationApi(definition.reservationFeature, 'POST');
        if (activeSurveyId !== context.pollId) return;
        context.data = { ...context.data, reservation: result, reservationPending: false };
        renderSurveyIntro(context);
        toast('预约成功！新赛季一起关注蓝月在外的表现 ✓');
      } catch {
        if (activeSurveyId !== context.pollId) return;
        context.data = { ...context.data, reservationPending: false };
        renderSurveyIntro(context);
        toast('预约服务暂时不可用，请稍后再试', 'error');
      }
    };
    actions.appendChild(ok);
    intro.appendChild(actions);
    body.appendChild(intro);
    return;
  }
  if (Array.isArray(definition.popupQuotes) && definition.popupQuotes.length > 0) {
    const quoteWall = el('section', 'survey-quote-wall');
    quoteWall.setAttribute('aria-label', 'City Xtra 评论区中英对照');
    quoteWall.appendChild(el('strong', 'survey-quote-wall-title', '差评如潮 · City Xtra 评论区'));
    for (const quote of definition.popupQuotes) {
      const card = el('blockquote', 'survey-quote-card');
      card.append(
        el('strong', 'survey-quote-zh', `“${quote.zh}”`),
        el('span', 'survey-quote-en', quote.en),
      );
      quoteWall.appendChild(card);
    }
    intro.appendChild(quoteWall);
  }
  const meta = el('div', 'survey-meta');
  const total = Math.max(0, Number(data.results?.total || 0));
  meta.appendChild(el('span', null, data.loading
    ? '正在后台同步实时票数…'
    : data.loadError
      ? '实时票数暂时无法同步'
      : data.ballot
        ? `${total} 位蓝月球迷的最新选择已汇总`
        : total > 0
          ? `已有 ${total} 位蓝月球迷参与，看看你是不是少数派？`
          : '等你投下第一票，看看之后谁和你站一边？'));
  if (data.ballot) {
    meta.appendChild(el('span', 'survey-voted', `✓ 你已提交${data.ballot.revision_count ? `并修改 ${data.ballot.revision_count} 次` : ''}`));
  }
  if (data.closed) meta.appendChild(el('span', 'survey-closed', '调查已截止'));
  else if (definition.closesAt) meta.appendChild(el('span', null, `可修改至 ${new Date(definition.closesAt).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`));
  else meta.appendChild(el('span', null, '提交后仍可随时修改'));
  intro.appendChild(meta);
  const actions = el('div', 'survey-intro-actions');
  const start = el('button', 'survey-primary', data.loading
    ? '正在准备问卷…'
    : data.ballot ? '查看最新结果' : definition.primaryLabel);
  start.type = 'button';
  start.disabled = Boolean(data.loading || (!data.ballot && data.closed));
  start.onclick = () => data.ballot ? renderSurveyResults(context) : renderSurveyForm(context);
  const results = el('button', 'survey-secondary', data.ballot ? '修改我的投票' : definition.resultsLabel);
  results.type = 'button';
  results.onclick = () => data.ballot ? renderSurveyForm(context) : renderSurveyResults(context);
  actions.appendChild(start);
  if (!data.ballot || !data.closed) actions.appendChild(results);
  intro.appendChild(actions);
  body.appendChild(intro);
}

function renderSurveyForm(context) {
  const { body, definition, data, pollId } = context;
  if (data.closed) { renderSurveyResults(context); return; }
  body.textContent = '';
  body.dataset.surveyView = 'form';
  const toolbar = el('div', 'survey-toolbar');
  const back = el('button', 'survey-back', '← 返回');
  back.type = 'button';
  back.onclick = () => renderSurveyIntro(context);
  toolbar.appendChild(back);
  toolbar.appendChild(el('span', 'survey-form-state', data.ballot ? '正在修改原选票，不会重复计票' : '匿名填写 · 无需注册'));
  body.appendChild(toolbar);

  const form = el('form', 'survey-form');
  const isMidfield = pollId === 'midfield_final_2026';
  const isCoach = pollId === COACH_SURVEY_ID;
  const isDeparture = pollId === DEPARTURE_SURVEY_ID;
  if (isMidfield) form.classList.add('midfield-survey-form');
  if (isCoach) form.classList.add('coach-survey-form');
  if (isDeparture) form.classList.add('departure-survey-form');
  for (const question of definition.questions) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'survey-question';
    fieldset.dataset.questionId = question.id;
    const legend = document.createElement('legend');
    legend.textContent = surveyQuestionTitle(definition, question);
    fieldset.appendChild(legend);
    if (question.hint) fieldset.appendChild(el('p', 'survey-question-hint', question.hint));
    const options = el('div', `survey-options${question.type === 'number' ? ' score' : ''}`);
    const saved = data.ballot?.answers?.[question.id];
    for (const option of question.options) {
      const label = el('label', 'survey-option');
      const input = document.createElement('input');
      input.type = question.type === 'multi' ? 'checkbox' : 'radio';
      input.name = surveyChoiceName(pollId, question.id);
      input.value = option.value;
      input.checked = question.type === 'multi'
        ? (Array.isArray(saved) ? saved : saved == null ? [] : [saved]).map(String).includes(option.value)
        : saved != null && String(saved) === option.value;
      const visible = el('span', option.description ? 'survey-option-detail' : null, option.description ? null : option.label);
      if (option.description) {
        visible.append(
          el('strong', null, option.label),
          el('small', null, option.description),
        );
      }
      label.append(input, visible);
      options.appendChild(label);
      if (question.type === 'multi') {
        input.addEventListener('change', () => {
          const inputs = [...options.querySelectorAll('input')];
          if (question.exclusive && input.checked && input.value === question.exclusive) {
            inputs.forEach((candidate) => { if (candidate !== input) candidate.checked = false; });
          } else if (question.exclusive && input.checked) {
            const exclusive = inputs.find((candidate) => candidate.value === question.exclusive);
            if (exclusive) exclusive.checked = false;
          }
          const selected = inputs.filter((candidate) => candidate.checked);
          if (selected.length > question.max) {
            input.checked = false;
            toast(`这题最多选择 ${question.max} 项`);
          }
        });
      }
    }
    fieldset.appendChild(options);
    form.appendChild(fieldset);
  }
  if (isMidfield) {
    const preview = el('div', 'midfield-choice-preview');
    preview.append(el('span', null, '你的中场答案'), el('strong', null, '每条线各选一项，即可生成组合'));
    const updatePreview = () => {
      const answers = {};
      for (const question of definition.questions) {
        const checked = form.querySelector(`input[name="${surveyChoiceName(pollId, question.id)}"]:checked`);
        if (checked) answers[question.id] = checked.value;
      }
      preview.querySelector('strong').textContent = midfieldCombinationLabel(answers) || '每条线各选一项，即可生成组合';
    };
    form.addEventListener('change', updatePreview);
    form.appendChild(preview);
    updatePreview();
  }
  const status = el('p', 'survey-submit-status');
  const submit = el('button', 'survey-submit', data.ballot ? '保存修改' : (definition.submitLabel || '提交我的选票'));
  submit.type = 'submit';
  form.append(status, submit);
  form.onsubmit = async (event) => {
    event.preventDefault();
    form.querySelectorAll('.survey-question.error').forEach((node) => node.classList.remove('error'));
    const answers = {};
    let firstMissing = null;
    for (const question of definition.questions) {
      const selector = `input[name="${surveyChoiceName(pollId, question.id)}"]`;
      const inputs = [...form.querySelectorAll(selector)];
      const selected = inputs.filter((input) => input.checked).map((input) => input.value);
      if (selected.length === 0) {
        if (!question.optional && !firstMissing) firstMissing = form.querySelector(`[data-question-id="${question.id}"]`);
        continue;
      }
      answers[question.id] = question.type === 'multi'
        ? selected
        : question.type === 'number' ? Number(selected[0]) : selected[0];
    }
    if (firstMissing) {
      firstMissing.classList.add('error');
      firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
      status.textContent = '还有必答题没有选择';
      return;
    }
    submit.disabled = true;
    status.textContent = data.ballot ? '正在保存修改…' : '正在提交选票…';
    try {
      const result = await surveyApi(pollId, 'POST', answers);
      if (result.ok !== true) {
        status.textContent = surveyErrorText(result.reason);
        submit.disabled = false;
        return;
      }
      context.data = result;
      toast(data.ballot ? '选票已经更新，统计结果同步刷新' : '投票成功，感谢救济站长 💙');
      renderSurveyResults(context);
    } catch {
      status.textContent = surveyErrorText('unavailable');
      submit.disabled = false;
    }
  };
  body.appendChild(form);
}

function renderSurveyResults(context) {
  const { body, definition, data } = context;
  body.textContent = '';
  body.dataset.surveyView = 'results';
  const isSummer = context.pollId === 'summer_2026';
  const isMidfield = context.pollId === 'midfield_final_2026';
  const isCoach = context.pollId === COACH_SURVEY_ID;
  const isDeparture = context.pollId === DEPARTURE_SURVEY_ID;
  body.classList.toggle('summer-survey-results', isSummer);
  body.classList.toggle('midfield-survey-results', isMidfield);
  body.classList.toggle('coach-survey-results', isCoach);
  body.classList.toggle('departure-survey-results', isDeparture);
  const toolbar = el('div', 'survey-toolbar');
  const back = el('button', 'survey-back', '← 返回');
  back.type = 'button';
  back.onclick = () => renderSurveyIntro(context);
  toolbar.appendChild(back);
  if (!data.closed) {
    const edit = el('button', 'survey-edit', data.ballot ? '修改我的答案' : '我也要投票');
    edit.type = 'button';
    edit.onclick = () => renderSurveyForm(context);
    toolbar.appendChild(edit);
  }
  body.appendChild(toolbar);
  if (data.loading) {
    body.appendChild(el('p', 'survey-loading', '正在后台同步实时结果…'));
    return;
  }
  if (data.loadError) {
    body.appendChild(el('p', 'survey-loading error', surveyErrorText('unavailable')));
    return;
  }
  const total = Math.max(0, Number(data.results?.total || 0));
  if (isCoach && total) {
    const download = el('button', 'survey-share', '↓ 下载统计图');
    download.type = 'button';
    download.onclick = () => downloadCoachSurveyResults(context);
    toolbar.appendChild(download);
  }
  if (isSummer && total) {
    const share = el('button', 'survey-share', '↗ 分享统计图');
    share.type = 'button';
    share.onclick = () => shareSummerSurveyResults(context);
    toolbar.appendChild(share);
  }
  if (isDeparture && total && !data.ballot) {
    const share = el('button', 'survey-share', '↗ 分享链接');
    share.type = 'button';
    share.onclick = () => shareDepartureSurveyLink(context);
    const download = el('button', 'survey-share', '↓ 下载统计图');
    download.type = 'button';
    download.onclick = () => downloadDepartureSurveyResults(context);
    toolbar.append(share, download);
  }
  const summary = el('div', 'survey-result-summary');
  summary.appendChild(el('strong', null, isDeparture && total
    ? '夏窗离队意难平榜'
    : isCoach && total
    ? '马雷斯卡英超首秀实时评分'
    : isMidfield && total ? '实时蓝月中场风向' : (isSummer && total ? '实时蓝月风向' : `${total} 份有效选票`)));
  summary.appendChild(el('span', null, total
    ? (isSummer ? `${total} 份有效选票 · 截至 ${surveyShareDate(new Date())}` : '实时统计 · 修改答案后会自动重新计算')
    : '还没有人投票，等你来开第一票'));
  body.appendChild(summary);
  if (isDeparture && data.ballot) {
    const thanks = el('section', 'departure-survey-thanks');
    thanks.append(
      el('p', 'departure-thanks-title', '谢谢你记得他们。'),
      el('p', 'departure-thanks-copy', '有些名字离开了名单，却留在了我们看球的那些年里。'),
    );
    const actions = el('div', 'departure-survey-actions');
    const save = el('button', 'survey-share departure-save-result', '保存结果');
    save.type = 'button';
    save.onclick = () => downloadDepartureSurveyResults(context);
    const share = el('button', 'survey-share departure-share-with-friends', '分享给陪你看过曼城的人');
    share.type = 'button';
    share.onclick = () => shareDepartureSurveyLink(context);
    actions.append(save, share);
    thanks.appendChild(actions);
    body.appendChild(thanks);
  }
  if (!total) return;

  if (isCoach) {
    renderCoachSurveyResults(context);
    return;
  }

  if (isMidfield) {
    renderMidfieldSurveyResults(context);
    return;
  }

  if (isSummer) {
    const scoreQuestion = definition.questions.find((question) => question.id === 'score');
    const positionQuestion = definition.questions.find((question) => question.id === 'positions');
    const scoreResult = data.results?.questions?.score || {};
    const average = Math.max(0, Number(scoreResult.average || 0));
    const maximum = Math.max(1, ...(scoreQuestion?.options || []).map((option) => Number(option.value)));
    const overview = el('section', 'summer-survey-overview');

    const scorePanel = el('div', 'summer-score-panel');
    scorePanel.appendChild(el('span', 'summer-overview-kicker', '球迷夏窗平均分'));
    const dial = el('div', 'summer-score-dial');
    dial.style.setProperty('--score-angle', `${Math.min(360, Math.max(0, average / maximum * 360))}deg`);
    const dialValue = el('div', 'summer-score-dial-value');
    dialValue.append(el('strong', null, average.toFixed(1)), el('span', null, `/ ${maximum}`));
    dial.appendChild(dialValue);
    scorePanel.append(dial, el('b', 'summer-score-band', surveyScoreBand(average)));

    const positionPanel = el('div', 'summer-position-panel');
    positionPanel.appendChild(el('span', 'summer-overview-kicker', '最亟需补强的位置'));
    const positionList = el('div', 'summer-position-list');
    for (const option of positionQuestion ? surveyResultOptions(context, positionQuestion).slice(0, 3) : []) {
      const row = el('div', 'summer-position-row');
      const label = el('div', 'summer-position-label');
      label.append(el('strong', null, option.label), el('b', null, `${option.percent}%`));
      const bar = el('div', 'summer-position-bar');
      const fill = el('span');
      fill.style.width = `${Math.min(100, option.percent)}%`;
      bar.appendChild(fill);
      row.append(label, bar);
      positionList.appendChild(row);
    }
    positionPanel.appendChild(positionList);
    overview.append(scorePanel, positionPanel);
    body.appendChild(overview);
  }

  const resultGrid = el('div', isSummer ? 'survey-chart-grid' : '');
  for (const question of definition.questions) {
    const result = data.results?.questions?.[question.id];
    if (!result) continue;
    const card = el('section', `survey-result-card${isSummer ? ' summer-chart-card' : ''}${isSummer && question.id === 'positions' ? ' featured' : ''}`);
    card.appendChild(el('h3', null, surveyQuestionTitle(definition, question).replace(/^\d+\.\s*/, '')));
    if (isSummer && question.type === 'number') {
      const options = surveyResultOptions(context, question, true);
      const maxCount = Math.max(1, ...options.map((option) => option.count));
      const chart = el('div', 'survey-score-distribution');
      chart.setAttribute('aria-label', '夏窗评分分布');
      for (const option of options) {
        const column = el('div', 'survey-score-column');
        const track = el('div', 'survey-score-column-track');
        const value = el('span', 'survey-score-column-value');
        value.style.height = `${Math.max(option.count ? 6 : 0, option.count / maxCount * 100)}%`;
        if (option.count) value.dataset.count = String(option.count);
        track.appendChild(value);
        column.append(track, el('b', null, String(option.value)));
        chart.appendChild(column);
      }
      card.appendChild(chart);
      card.appendChild(el('p', 'survey-result-note', '柱顶数字为票数 · 0—10 分完整分布'));
      resultGrid.appendChild(card);
      continue;
    }
    if (question.type === 'number') {
      const average = Number(result.average || 0);
      const max = Math.max(...question.options.map((option) => Number(option.value)));
      const averageLine = el('div', 'survey-average');
      averageLine.appendChild(el('strong', null, `${average.toFixed(1)} / ${max}`));
      card.appendChild(averageLine);
    }
    const rows = el('div', 'survey-result-rows');
    const populated = surveyResultOptions(context, question);
    for (const option of populated) {
      const row = el('div', 'survey-result-row');
      const label = el('div', 'survey-result-label');
      label.append(el('span', null, option.label), el('b', null, `${option.percent}% · ${option.count}票`));
      const bar = el('div', 'survey-result-bar');
      const fill = el('span');
      fill.style.width = `${Math.min(100, option.percent)}%`;
      bar.appendChild(fill);
      row.append(label, bar);
      rows.appendChild(row);
    }
    card.appendChild(rows);
    if (question.type === 'multi') card.appendChild(el('p', 'survey-result-note', '本题可多选，因此各项比例相加可能超过 100%'));
    resultGrid.appendChild(card);
  }
  body.appendChild(resultGrid);
  if (isDeparture && data.ballot) {
    const affinity = departureSurveyAffinity(context);
    if (affinity) {
      const note = el('div', 'departure-survey-affinity');
      note.appendChild(el('strong', null, affinity.primary));
      if (affinity.secondary) note.appendChild(el('span', null, affinity.secondary));
      body.appendChild(note);
    }
  }
}

function renderCoachSurveyResults(context) {
  const { body, definition, data } = context;
  const scoreQuestion = definition.questions.find((question) => question.id === 'score');
  const scoreResult = data.results?.questions?.score || {};
  const average = Math.max(0, Math.min(10, Number(scoreResult.average || 0)));
  const overview = el('section', 'coach-verdict-card');
  const dial = el('div', 'coach-score-dial');
  dial.style.setProperty('--coach-score-angle', `${average / 10 * 360}deg`);
  const value = el('div', 'coach-score-value');
  value.append(el('strong', null, average.toFixed(1)), el('span', null, '/ 10 分'));
  dial.appendChild(value);
  const verdict = el('div', 'coach-verdict-copy');
  verdict.append(
    el('span', null, '当前球迷评分'),
    el('strong', null, coachScoreVerdict(average)),
    el('p', null, '战术科研、临场调整与未来前景，五题实时统计。'),
  );
  overview.append(dial, verdict);
  body.appendChild(overview);

  const scoreCard = el('section', 'survey-result-card coach-score-card');
  scoreCard.appendChild(el('h3', null, '0—10 分完整分布'));
  const scoreOptions = surveyResultOptions(context, scoreQuestion, true);
  const maxCount = Math.max(1, ...scoreOptions.map((option) => option.count));
  const chart = el('div', 'survey-score-distribution');
  chart.setAttribute('aria-label', '马雷斯卡英超首秀评分分布');
  for (const option of scoreOptions) {
    const column = el('div', 'survey-score-column');
    const track = el('div', 'survey-score-column-track');
    const bar = el('span', 'survey-score-column-value');
    bar.style.height = `${Math.max(option.count ? 6 : 0, option.count / maxCount * 100)}%`;
    if (option.count) bar.dataset.count = String(option.count);
    track.appendChild(bar);
    column.append(track, el('b', null, String(option.value)));
    chart.appendChild(column);
  }
  scoreCard.append(chart, el('p', 'survey-result-note', '柱顶数字为票数 · 平均分会随新选票实时变化'));
  body.appendChild(scoreCard);

  const grid = el('div', 'coach-result-grid');
  for (const question of definition.questions.filter((item) => item.id !== 'score')) {
    const card = el('section', 'survey-result-card coach-result-card');
    card.appendChild(el('h3', null, surveyQuestionTitle(definition, question).replace(/^\d+\.\s*/, '')));
    const rows = el('div', 'survey-result-rows');
    for (const option of surveyResultOptions(context, question)) {
      const row = el('div', 'survey-result-row');
      const label = el('div', 'survey-result-label');
      label.append(el('span', null, option.label), el('b', null, `${option.percent}% · ${option.count}票`));
      const track = el('div', 'survey-result-bar');
      const fill = el('span');
      fill.style.width = `${Math.min(100, option.percent)}%`;
      track.appendChild(fill);
      row.append(label, track);
      rows.appendChild(row);
    }
    card.appendChild(rows);
    grid.appendChild(card);
  }
  body.appendChild(grid);

  const nextPoll = el('section', 'coach-next-poll');
  const nextButton = el('button', 'coach-next-poll-button', '去给夏窗打分');
  nextButton.type = 'button';
  nextButton.onclick = () => openSurvey('summer_2026');
  nextPoll.appendChild(nextButton);
  body.appendChild(nextPoll);
}

function renderMidfieldSurveyResults(context) {
  const { body, definition, data } = context;
  const total = Math.max(1, Number(data.results?.total || 0));
  const combinations = midfieldCombinationEntries(context);
  const winner = combinations[0];

  const winnerCard = el('section', 'midfield-winner-card');
  winnerCard.appendChild(el('span', 'midfield-winner-kicker', '🏆 当前蓝月球迷最想看到的中场结局'));
  winnerCard.appendChild(el('strong', 'midfield-winner-combo', winner?.label || '等待第一份完整选择'));
  const winnerStats = el('div', 'midfield-winner-stats');
  winnerStats.append(el('b', null, `${winner?.percent || 0}%`), el('span', null, `${winner?.count || 0} 票支持`));
  winnerCard.appendChild(winnerStats);
  body.appendChild(winnerCard);

  const tendencyGrid = el('section', 'midfield-tendency-grid');
  for (const question of definition.questions) {
    const options = surveyResultOptions(context, question, true);
    const lead = options[0] || { percent: 0, label: '' };
    const card = el('div', 'midfield-tendency-card');
    card.appendChild(el('h3', null, question.title));
    const dial = el('div', 'midfield-tendency-dial');
    dial.style.setProperty('--tendency-angle', `${Math.max(0, Math.min(360, lead.percent * 3.6))}deg`);
    dial.append(el('strong', null, `${lead.percent}%`), el('span', null, lead.label));
    card.appendChild(dial);
    const legend = el('div', 'midfield-tendency-legend');
    for (const option of options) {
      const row = el('div');
      row.append(el('span', null, option.label), el('b', null, `${option.percent}%`));
      legend.appendChild(row);
    }
    card.appendChild(legend);
    tendencyGrid.appendChild(card);
  }
  body.appendChild(tendencyGrid);

  const ranking = el('section', 'midfield-ranking-card');
  ranking.appendChild(el('h3', null, '8 种中场结局完整排名'));
  const rows = el('div', 'midfield-ranking-rows');
  combinations.forEach((combination, index) => {
    const row = el('div', `midfield-ranking-row${index === 0 ? ' leader' : ''}`);
    const label = el('div', 'midfield-ranking-label');
    label.append(el('i', null, String(index + 1)), el('span', null, combination.label), el('b', null, `${combination.percent}% · ${combination.count}票`));
    const bar = el('div', 'midfield-ranking-bar');
    const fill = el('span');
    fill.style.width = `${Math.max(combination.count ? 3 : 0, combination.percent)}%`;
    bar.appendChild(fill);
    row.append(label, bar);
    rows.appendChild(row);
  });
  ranking.appendChild(rows);
  body.appendChild(ranking);
}

async function openSurvey(pollId) {
  const definition = SURVEY_DEFINITIONS[pollId];
  if (!definition) return;
  acknowledgeSurveyInvite(pollId);
  closeSurvey();
  activeSurveyId = pollId;
  document.body.classList.add('survey-open');
  const overlay = el('div', 'survey-overlay');
  const sheet = el('section', `survey-sheet${definition.reportOnly ? ' scout-report-sheet' : ''}`);
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', definition.title);
  const head = el('div', 'survey-head');
  head.appendChild(el('h2', null, definition.title));
  const close = el('button', 'survey-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', definition.reportOnly ? '关闭阿兰球探报告' : '关闭调查');
  close.onclick = closeSurvey;
  head.appendChild(close);
  const body = el('div', 'survey-body');
  sheet.append(head, body);
  overlay.appendChild(sheet);
  overlay.onclick = (event) => { if (event.target === overlay) closeSurvey(); };
  document.body.appendChild(overlay);
  close.focus();
  const context = {
    pollId,
    definition,
    body,
    data: {
      ok: true,
      closed: Boolean(definition.closesAt && Date.now() >= definition.closesAt),
      ballot: null,
      results: { total: 0, questions: {} },
      loading: true,
    },
  };
  if (definition.reportOnly) {
    context.data = { ...context.data, loading: false };
    renderSurveyIntro(context);
    return;
  }
  if (definition.announcementOnly) {
    context.data = {
      ...context.data,
      loading: false,
      reservation: {
        count: Number(definition.reservationBase || 0),
        reserved: false,
        loading: Boolean(definition.reservationFeature),
      },
    };
    renderSurveyIntro(context);
    if (!definition.reservationFeature) return;
    try {
      const reservation = await featureReservationApi(definition.reservationFeature);
      if (activeSurveyId !== pollId) return;
      context.data = { ...context.data, reservation: { ...reservation, loading: false } };
      if (body.dataset.surveyView === 'intro') renderSurveyIntro(context);
    } catch {
      if (activeSurveyId !== pollId) return;
      context.data = {
        ...context.data,
        reservation: { ...context.data.reservation, loading: false, loadError: true },
      };
      if (body.dataset.surveyView === 'intro') renderSurveyIntro(context);
    }
    return;
  }
  renderSurveyIntro(context);
  try {
    context.data = await surveyApi(pollId);
    if (activeSurveyId !== pollId) return;
    if (body.dataset.surveyView === 'results') renderSurveyResults(context);
    else if (body.dataset.surveyView === 'intro') {
      if (definition.openOnForm && !context.data.ballot && !context.data.closed) renderSurveyForm(context);
      else renderSurveyIntro(context);
    }
  } catch {
    if (activeSurveyId !== pollId) return;
    context.data = { ...context.data, loading: false, loadError: true };
    if (body.dataset.surveyView === 'results') renderSurveyResults(context);
    else if (body.dataset.surveyView === 'intro') renderSurveyIntro(context);
  }
}

function renderPinnedCard(it) {
  const card = el('article', `pinned-card ${TIER_CLASS[it.tier] || 't2'}`);
  card.dataset.itemId = itemId(it);
  if (state.library.read.has(itemId(it))) card.classList.add('is-read');

  const cardHead = el('div', 'pinned-head');
  cardHead.appendChild(el('span', `badge-tier ${TIER_CLASS[it.tier] || 't2'}`, it.tier));
  cardHead.appendChild(el('span', 'pinned-source', it.source_name_zh || it.source_name));
  cardHead.appendChild(el('span', 'pinned-time', relTime(it.published_at)));
  const hide = el('button', 'pinned-hide', '✓ 隐藏');
  hide.type = 'button';
  hide.title = '标记已读并从置顶专区隐藏';
  hide.setAttribute('aria-label', hide.title);
  hide.onclick = () => hidePinnedItem(it, card);
  cardHead.appendChild(hide);
  card.appendChild(cardHead);

  appendPinnedText(card, it);

  const badges = (it.badges || []).filter((badge) => BADGE_ZH[badge]).slice(0, 2);
  if (badges.length) {
    const badgeRow = el('div', 'pinned-badges');
    badges.forEach((badge) => badgeRow.appendChild(el('span', `ev-badge${badge === 'HERE_WE_GO' ? ' gold' : ''}`, BADGE_ZH[badge])));
    card.appendChild(badgeRow);
  }

  const link = el('a', 'pinned-link', it.kind === 'tweet' ? '查看原推 ↗' : '阅读原文 ↗');
  link.href = it.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.onclick = () => { markRead(it); };
  const pinnedActions = el('div', 'pinned-actions');
  pinnedActions.append(link, buildCommentButton(it, true), buildCopyLinkButton(it), buildSaveImageButton(it), buildDongqiudiImageButton(it));
  card.appendChild(pinnedActions);
  card.appendChild(buildReactionBar(it, true, 'pinned'));
  observeEngagement(card, it);
  return card;
}

function renderChelseaWatchCard(item) {
  const isCamara = item.watch_focus === 'lamine_camara';
  const card = el('a', `chelsea-watch-card${isCamara ? ' is-camara' : ''}`);
  card.href = item.url;
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.setAttribute('aria-label', `查看${item.source_name_zh || item.source_name}的蓝桥引援消息`);

  const meta = el('div', 'chelsea-watch-card-meta');
  meta.appendChild(el('span', `badge-tier ${TIER_CLASS[item.tier] || 't2'}`, item.tier || 'T2'));
  meta.appendChild(el('strong', 'chelsea-watch-source', item.source_name_zh || item.source_name));
  meta.appendChild(el(
    'span',
    `chelsea-watch-kind${isCamara ? ' camara' : item.watch_type === 'enzo_city' ? ' enzo' : ''}`,
    isCamara ? '重点·卡马拉' : item.watch_type === 'enzo_city' ? '恩佐直连曼城' : '切尔西引援',
  ));
  meta.appendChild(el('time', 'chelsea-watch-time', relTime(item.published_at)));
  card.appendChild(meta);

  const language = state.filters.lang;
  if (language !== 'en' && item.text_zh) card.appendChild(el('p', 'chelsea-watch-copy zh', item.text_zh));
  if (language === 'en' || language === 'both' || !item.text_zh) {
    card.appendChild(el('p', `chelsea-watch-copy en${language === 'both' ? ' secondary' : ''}`, item.text));
  }
  card.appendChild(el('span', 'chelsea-watch-link', item.kind === 'tweet' ? '查看原推 ↗' : '阅读原文 ↗'));
  return card;
}

function renderChelseaWatchModule(zone) {
  const items = state.chelseaWatchItems || [];
  const section = el('section', `chelsea-watch${state.chelseaWatchOpen ? ' is-open' : ''}`);
  section.setAttribute('aria-label', '蓝桥引援雷达');

  const toggle = el('button', 'chelsea-watch-head');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(state.chelseaWatchOpen));
  const copy = el('span', 'chelsea-watch-heading-copy');
  copy.append(
    el('strong', 'chelsea-watch-title', '🔍 蓝桥引援雷达'),
    el('span', 'chelsea-watch-subtitle', '重点关注：拉明·卡马拉与切尔西的转会进展。'),
    el('span', 'chelsea-watch-scope', '可信白名单：切尔西官方、跟队记者与一线转会记者'),
  );
  const count = state.chelseaWatchLoaded ? `${items.length} 条动态` : '正在盯盘';
  toggle.append(copy, el('span', 'chelsea-watch-count', `${count} ${state.chelseaWatchOpen ? '⌃' : '⌄'}`));
  toggle.onclick = () => {
    state.chelseaWatchOpen = !state.chelseaWatchOpen;
    renderFocusZone();
  };
  section.appendChild(toggle);

  if (!state.chelseaWatchLoaded) {
    section.appendChild(el('p', 'chelsea-watch-empty', '正在同步最新切尔西引援动态…'));
  } else if (!items.length) {
    section.appendChild(el('p', 'chelsea-watch-empty', '暂无符合条件的新动态，后台仍会每 15 分钟继续盯盘。'));
  } else {
    const grid = el('div', 'chelsea-watch-grid');
    const visibleItems = items.slice(0, state.chelseaWatchOpen ? 12 : 3);
    visibleItems.forEach((item) => grid.appendChild(renderChelseaWatchCard(item)));
    section.appendChild(grid);
    if (items.length > 3) {
      const more = el(
        'button',
        'chelsea-watch-more',
        state.chelseaWatchOpen ? '收起蓝桥雷达' : `展开更多动态（${Math.min(items.length, 12)} 条）`,
      );
      more.type = 'button';
      more.onclick = () => {
        state.chelseaWatchOpen = !state.chelseaWatchOpen;
        renderFocusZone();
      };
      section.appendChild(more);
    }
  }
  zone.appendChild(section);
}

function renderFocusZone() {
  const zone = $('#focus-zone');
  clearEngagementWatchers(zone);
  zone.textContent = '';
  zone.hidden = false;

  renderChelseaWatchModule(zone);

  const banner = el('button', 'departure-heartbreak-banner');
  banner.type = 'button';
  banner.setAttribute('aria-label', '打开夏窗离队意难平投票');
  banner.onclick = () => openSurvey(DEPARTURE_SURVEY_ID);
  banner.appendChild(el('span', 'departure-heartbreak-kicker', '💔 夏窗收尾 · 蓝月告别'));
  const headline = el('h2', 'departure-heartbreak-headline', '夏窗收尾｜谁最让你意难平？');
  banner.append(
    headline,
    el('p', 'departure-heartbreak-question', '这个夏天，曼城送走了太多熟悉的面孔。'),
    el('span', 'departure-heartbreak-cta', '去投票 →'),
  );
  zone.appendChild(banner);

  const featureRow = el('div', 'focus-feature-row');
  featureRow.setAttribute('aria-label', '专题与调查');
  const surveyEntries = el('div', 'focus-survey-entries');
  for (const pollId of FOCUS_SURVEY_ORDER) {
    const definition = SURVEY_DEFINITIONS[pollId];
    if (!definition.entry) continue;
    const entry = el('button', 'survey-entry', definition.entry);
    entry.type = 'button';
    entry.dataset.pollId = pollId;
    entry.setAttribute('aria-label', `打开${definition.title}`);
    entry.onclick = () => openSurvey(pollId);
    surveyEntries.appendChild(entry);
  }
  featureRow.appendChild(surveyEntries);
  zone.appendChild(featureRow);
}

function renderCard(it) {
  const card = el('article', `card ${TIER_CLASS[it.tier] || 't2'}`);
  card.dataset.itemId = itemId(it);
  if (state.library.read.has(itemId(it))) card.classList.add('is-read');
  if ((it.badges || []).includes('HERE_WE_GO')) card.classList.add('hwg');
  if (state.newIds.has(it.id)) card.classList.add('is-new');

  // 头部
  const head = el('div', 'card-head');
  const av = el('div', 'avatar', initialsOf(it.source_name));
  av.style.background = `hsl(${hueOf(it.source_key)}, 45%, 40%)`;
  head.appendChild(av);
  head.appendChild(el('span', 'src-name', it.source_name_zh || it.source_name));
  const tierBadge = el('span', `badge-tier ${TIER_CLASS[it.tier]}`, it.tier);
  head.appendChild(tierBadge);
  if (it.note_zh) head.appendChild(el('span', 'src-note', it.note_zh));
  if ((it.focus || []).length) {
    const m = el('span', 'focus-mark', '🎯');
    m.title = '焦点追踪对象相关';
    head.appendChild(m);
  }
  head.appendChild(el('span', 'kind', it.kind === 'tweet' ? '𝕏' : '📰'));
  const time = el('span', 'time', relTime(it.published_at));
  time.title = new Date(it.published_at).toLocaleString('zh-CN');
  head.appendChild(time);
  card.appendChild(head);

  // 正文（含语言切换）
  const body = el('div', 'card-body');
  const lang = state.filters.lang;
  const kw = state.filters.search;
  const zh = it.text_zh, en = it.text;
  if (lang === 'zh') {
    const p = el('div', 'zh');
    highlightInto(p, zh || en || '', kw);
    body.appendChild(p);
    if (zh && en) {
      const det = document.createElement('details');
      const sum = el('summary', null, '查看原文');
      sum.style.cssText = 'cursor:pointer;font-size:12px;color:var(--text-dim);margin-top:4px;';
      det.appendChild(sum);
      const ep = el('div', 'en');
      highlightInto(ep, en, kw);
      det.appendChild(ep);
      body.appendChild(det);
    }
  } else if (lang === 'en') {
    const p = el('div', 'en');
    p.style.color = 'var(--text)';
    highlightInto(p, en || zh || '', kw);
    body.appendChild(p);
  } else {
    const p = el('div', 'zh');
    highlightInto(p, zh || en || '', kw);
    body.appendChild(p);
    if (zh && en) {
      const ep = el('div', 'en sub');
      highlightInto(ep, en, kw);
      body.appendChild(ep);
    }
  }
  card.appendChild(body);

  // 事件徽章
  const badges = (it.badges || []).filter((b) => BADGE_ZH[b]);
  if (badges.length) {
    const row = el('div', 'card-badges');
    for (const b of badges) {
      row.appendChild(el('span', `ev-badge${b === 'HERE_WE_GO' ? ' gold' : ''}`, BADGE_ZH[b]));
    }
    card.appendChild(row);
  }

  // 底部
  const foot = el('div', 'card-foot');
  const link = el('a', null, it.kind === 'tweet' ? '查看原推 ↗' : '阅读原文 ↗');
  link.href = it.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.onclick = () => { markRead(it); };
  foot.appendChild(link);
  foot.appendChild(buildCommentButton(it));
  if (it.dupes && it.dupes.length) {
    foot.classList.add('has-dupes');
    const btn = el('button', 'dupes-btn', `另有 ${it.dupes.length} 个来源 ▾`);
    const list = el('div', 'dupes-list');
    list.hidden = true;
    for (const d of it.dupes) {
      const a = el('a', null, `[${d.tier}] ${d.source_name_zh || d.source_name}`);
      a.href = d.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      list.appendChild(a);
    }
    btn.onclick = () => { list.hidden = !list.hidden; };
    foot.appendChild(btn);
    foot.appendChild(buildLibraryActions(it));
    card.appendChild(foot);
    card.appendChild(list);
  } else {
    foot.appendChild(buildLibraryActions(it));
    card.appendChild(foot);
  }
  card.appendChild(buildReactionBar(it));
  observeEngagement(card, it);
  return card;
}

// ---------------- 信源多选菜单 ----------------
function buildSourceMenu() {
  const menu = $('#src-menu');
  menu.textContent = '';
  const tools = el('div', 'src-tools');
  const btnAll = el('button', null, '全选');
  const btnNone = el('button', null, '清空');
  btnAll.onclick = () => { state.filters.sources = null; saveFilters(); buildSourceMenu(); render(); updateSrcBtn(); };
  btnNone.onclick = () => { state.filters.sources = []; saveFilters(); buildSourceMenu(); render(); updateSrcBtn(); };
  tools.append(btnAll, btnNone);
  menu.appendChild(tools);

  for (const it of currentSourceKeys()) {
    const label = el('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !state.filters.sources || state.filters.sources.includes(it.source_key);
    cb.onchange = () => {
      let sel = state.filters.sources ?? currentSourceKeys().map((s) => s.source_key);
      sel = cb.checked ? [...new Set([...sel, it.source_key])] : sel.filter((k) => k !== it.source_key);
      state.filters.sources = sel.length === currentSourceKeys().length ? null : sel;
      saveFilters(); render(); updateSrcBtn();
    };
    label.appendChild(cb);
    label.appendChild(el('span', `badge-tier ${TIER_CLASS[it.tier]}`, it.tier));
    label.appendChild(el('span', null, it.source_name_zh || it.source_name));
    menu.appendChild(label);
  }
}
function updateSrcBtn() {
  const f = state.filters;
  $('#src-btn').textContent = f.sources == null ? '全部信源 ▾' : `已选 ${f.sources.length} 个信源 ▾`;
}

// ---------------- 状态面板 ----------------
function renderStatusDot() {
  const s = state.status;
  if (!s) return;
  const anyErr = (s.sources || []).some((x) => x.enabled !== false && !x.ok);
  $('#btn-status').classList.toggle('alert', anyErr);
}
function openStatus() {
  const panel = $('#status-panel'), scrim = $('#scrim');
  panel.hidden = false; scrim.hidden = false;
  const list = $('#status-list');
  list.textContent = '';
  const s = state.status;
  $('#status-sub').textContent = s
    ? `上次抓取 ${relTime(s.updated_at)} · 绿=正常 红=失败 灰=未启用 · 「抓」=从源头拿到的原始条数，「入」=通过曼城过滤新入库的条数（记者聊别的话题时 入=0 属正常）`
    : '暂无状态数据（本地演示模式）';
  if (!s) return;
  for (const src of s.sources || []) {
    const li = el('li');
    let cls = 'ok';
    if (src.enabled === false) cls = 'off';
    else if (!src.ok) cls = 'err';
    else if (src.items === 0 && !src.last_success) cls = 'warn';
    li.appendChild(el('span', `dot ${cls}`));
    li.appendChild(el('span', `badge-tier ${TIER_CLASS[src.tier] || 't2'}`, src.tier));
    li.appendChild(el('span', 's-name', src.name_zh || src.name));
    const meta = src.enabled === false
      ? '未启用'
      : src.ok
        ? `抓 ${src.items ?? 0} · 入 ${src.admitted ?? '—'} · ${src.last_success ? relTime(src.last_success) : '—'}`
        : (src.error || '抓取失败').slice(0, 40);
    const m = el('span', 's-meta', meta);
    if (src.error) m.title = src.error;
    li.appendChild(m);
    list.appendChild(li);
  }
}
function closeStatus() { $('#status-panel').hidden = true; $('#scrim').hidden = true; }

// ---------------- 新消息胶囊 ----------------
function showNewPill() {
  if (state.pendingNew <= 0) return;
  $('#new-count').textContent = state.pendingNew;
  $('#new-pill').hidden = false;
}

const GH_REPO = 'adolfcns/city-transfer-hub';
const GH_WORKFLOW = 'fetch.yml';
// 公共触发端点（Cloudflare Worker 代理，令牌藏在 Worker 里不公开）。
// 留空 = 未开启公共触发，访客点 ⚡ 会看到引导面板。
const TRIGGER_ENDPOINT = 'https://city-trigger.shiqie7272.workers.dev/';
// 全站计数优先走国内可直连的 Pages；Worker 仅作为读取备用入口。
const PRAYER_ENDPOINTS = [
  'https://city-transfer-hub.pages.dev/prayer',
  `${TRIGGER_ENDPOINT}prayer`,
];
const REACTION_ENDPOINTS = [
  'https://city-transfer-hub.pages.dev/reactions',
  `${TRIGGER_ENDPOINT}reactions`,
];
const COMMENT_ENDPOINTS = [
  'https://city-transfer-hub.pages.dev/comments',
  `${TRIGGER_ENDPOINT}comments`,
];
const SURVEY_ENDPOINTS = [
  'https://city-transfer-hub.pages.dev/surveys',
  `${TRIGGER_ENDPOINT}surveys`,
];
const FEATURE_RESERVATION_ENDPOINTS = [
  'https://city-transfer-hub.pages.dev/reservations',
  `${TRIGGER_ENDPOINT}reservations`,
];
const SHARE_EVENT_ENDPOINTS = [
  'https://city-transfer-hub.pages.dev/share-events',
  `${TRIGGER_ENDPOINT}share-events`,
];

function newShareEventId() {
  try {
    if (crypto.randomUUID) return `se_${crypto.randomUUID().replace(/-/g, '')}`;
  } catch { /* 非安全上下文时使用随机兜底 */ }
  return `se_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 18)}`;
}

async function recordShareEvent(eventType, targetId = DEPARTURE_SURVEY_ID) {
  const eventId = newShareEventId();
  const endpoints = [...new Set([state.shareEventEndpoint, ...SHARE_EVENT_ENDPOINTS].filter(Boolean))];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        cache: 'no-store',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          event_type: eventType,
          target_id: targetId,
          voter: state.surveyProfile.voter,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok === true) {
        state.shareEventEndpoint = endpoint;
        return true;
      }
    } catch { /* 静默切换备用接口，不影响分享体验 */ }
  }
  return false;
}

function recordRequestedShareVisit() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('survey') !== DEPARTURE_SURVEY_ID
      || url.searchParams.get('from') !== SHARE_ATTRIBUTION_KEY) return;
    void recordShareEvent('shared_visit', DEPARTURE_SURVEY_ID);
    url.searchParams.delete('from');
    window.history.replaceState(null, '', url.href);
  } catch { /* 无效地址不影响页面启动 */ }
}
const TRIGGER_COOLDOWN_MS = 60 * 1000;      // 单设备触发冷却
const FRESH_ENOUGH_MS = 3 * 60 * 1000;      // 数据足够新就不重复抓
let toastTimer = null;
function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
}

function dismissRecoveryNotice() {
  const notice = $('#recovery-notice');
  if (!notice) return;
  notice.hidden = true;
  try { localStorage.setItem(RECOVERY_NOTICE_KEY, 'dismissed'); }
  catch { /* 禁用本机存储时，本次访问内仍可关闭 */ }
}

function showRecoveryNotice() {
  const notice = $('#recovery-notice');
  if (!notice) return;
  try {
    if (localStorage.getItem(RECOVERY_NOTICE_KEY) === 'dismissed') return;
  } catch { /* 禁用本机存储时仍展示公告 */ }
  notice.hidden = false;
  setTimeout(() => $('#recovery-notice-ok')?.focus(), 0);
}

async function triggerCloudFetch() {
  const pat = localStorage.getItem('cth_pat');
  if (!pat && !TRIGGER_ENDPOINT) { $('#trigger-panel').hidden = false; return; }
  // 数据够新就别浪费一次云端任务
  const age = Date.now() - new Date(state.generatedAt).getTime();
  if (age < FRESH_ENOUGH_MS) {
    toast(`数据 ${Math.max(1, Math.round(age / 60000))} 分钟前刚更新过，已是最新`);
    return;
  }
  // 单设备冷却，防止连点
  const last = Number(localStorage.getItem('cth_last_trigger') || 0);
  if (Date.now() - last < TRIGGER_COOLDOWN_MS) {
    toast('刚触发过了，云端正在抓取，请稍等…');
    return;
  }
  localStorage.setItem('cth_last_trigger', String(Date.now()));
  const btn = $('#btn-trigger');
  btn.disabled = true; btn.classList.add('spin');
  try {
    let ok = false;
    if (pat) {
      // 站长模式：本机令牌直连 GitHub API
      const res = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${pat}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      });
      if (res.status === 204) ok = true;
      else if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('cth_pat');
        toast('令牌无效或已过期，请重新设置', 'err');
        $('#trigger-panel').hidden = false;
      } else toast(`触发失败（HTTP ${res.status}）`, 'err');
    } else {
      // 访客模式：走 Worker 代理（令牌在服务端）
      const res = await fetch(TRIGGER_ENDPOINT, { method: 'POST' });
      if (res.ok) ok = true;
      else if (res.status === 429) toast('别人刚触发过，云端正在抓取，稍等自动刷新…');
      else toast('触发服务暂时不可用，稍后再试', 'err');
    }
    if (ok) {
      toast('⚡ 已触发云端抓取，约 2 分钟，完成后自动刷新…');
      fastPollUntilFresh();
    }
  } catch {
    toast('网络错误：触发请求没发出去（检查网络/代理）', 'err');
  } finally {
    btn.disabled = false; btn.classList.remove('spin');
  }
}

// 触发后加速轮询，直到数据变新
let fastPollTimer = null;
function fastPollUntilFresh() {
  const baseline = state.generatedAt;
  let tries = 0;
  clearInterval(fastPollTimer);
  fastPollTimer = setInterval(async () => {
    tries++;
    await loadData(true);
    if (state.generatedAt !== baseline) {
      clearInterval(fastPollTimer);
      toast('✓ 数据已更新到最新');
    } else if (tries >= 24) { // 8 分钟兜底
      clearInterval(fastPollTimer);
      toast('云端任务可能在排队，稍后自动刷新会带出新数据');
    }
  }, 20000);
}

function savePat() {
  const v = $('#pat-input').value.trim();
  if (!/^(github_pat_|ghp_|gho_)[A-Za-z0-9_]{20,}$/.test(v)) {
    $('#pat-status').textContent = '格式不对：应以 github_pat_ 或 ghp_ 开头';
    return;
  }
  localStorage.setItem('cth_pat', v);
  $('#pat-input').value = '';
  $('#pat-status').textContent = '✓ 已保存到本机浏览器';
  $('#trigger-panel').hidden = true;
  triggerCloudFetch();
}

// ---------------- 倒计时 ----------------
function renderCountdown() {
  const now = Date.now();
  const w = WINDOWS.find((x) => x.ts > now);
  const n = $('#window-countdown');
  if (!w) { n.textContent = '转会窗已关闭'; return; }
  const totalMs = Math.max(0, w.ts - now);
  const hours = Math.floor(totalMs / 3600e3);
  const minutes = Math.floor((totalMs % 3600e3) / 60e3);
  const seconds = Math.floor((totalMs % 60e3) / 1000);
  const values = { hours, minutes, seconds };
  for (const [part, value] of Object.entries(values)) {
    const node = n.querySelector(`[data-countdown="${part}"]`);
    if (node) node.textContent = String(value).padStart(2, '0');
  }
  n.setAttribute('aria-label',
    `留给维亚纳出手的时间，只剩 ${hours} 小时 ${minutes} 分 ${seconds} 秒。`);
}

// ---------------- 事件绑定 ----------------
function bind() {
  $('#search').oninput = (e) => {
    state.filters.search = e.target.value.trim();
    scheduleSearchRender();
  };
  $('#src-btn').onclick = (e) => { e.stopPropagation(); $('#src-menu').hidden = !$('#src-menu').hidden; };
  document.addEventListener('click', (e) => {
    if (!$('#src-select').contains(e.target)) $('#src-menu').hidden = true;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.querySelector('.comment-overlay')) closeComments();
    if (event.key === 'Escape' && document.querySelector('.survey-overlay')) closeSurvey();
    if (event.key === 'Escape' && !$('#recovery-notice')?.hidden) dismissRecoveryNotice();
  });
  document.querySelectorAll('#lang-seg button').forEach((button) => {
    button.classList.toggle('active', button.dataset.lang === state.filters.lang);
    button.onclick = () => {
      state.filters.lang = button.dataset.lang;
      document.querySelectorAll('#lang-seg button').forEach((item) => item.classList.toggle('active', item === button));
      saveFilters(); render();
    };
  });
  document.querySelectorAll('[data-library-view]').forEach((button) => {
    button.onclick = () => {
      state.filters.libraryView = button.dataset.libraryView;
      saveFilters();
      render();
    };
  });
  $('#mark-all-read').onclick = async () => {
    const button = $('#mark-all-read');
    button.disabled = true;
    if (hasMoreArchives()) await loadAllArchives();
    if (hasMoreArchives()) {
      button.disabled = false;
      toast('更早消息尚未加载完成，请稍后再试', 'err');
      return;
    }
    for (const it of state.items) state.library.read.add(itemId(it));
    saveLibrary();
    updateLibraryBar();
    if (state.filters.libraryView === 'unread') renderFeed();
    else syncAllRenderedItems();
  };
  $('#btn-refresh').onclick = () => loadData(true);
  $('#btn-trigger').onclick = triggerCloudFetch;
  // 一键收藏：复制网址 + 按设备给出最短收藏路径（浏览器不允许网页直接写书签）
  $('#btn-fav').onclick = async () => {
    try { await navigator.clipboard.writeText('https://adolfcns.github.io/city-transfer-hub/'); } catch { /* 剪贴板不可用则只提示 */ }
    const ua = navigator.userAgent;
    let msg;
    if (/iPhone|iPad|iPod/i.test(ua)) msg = '网址已复制 ✓ iPhone：点浏览器"分享"按钮 → 添加到主屏幕或收藏';
    else if (/Android/i.test(ua)) msg = '网址已复制 ✓ 点浏览器右上角菜单 ⋮ → 添加书签';
    else msg = `网址已复制 ✓ 按 ${/Mac/i.test(ua) ? '⌘D' : 'Ctrl+D'} 即可收藏本站 💙`;
    toast(msg);
  };
  $('#btn-trigger-close').onclick = () => { $('#trigger-panel').hidden = true; };
  $('#trigger-panel').addEventListener('click', (e) => { if (e.target === $('#trigger-panel')) $('#trigger-panel').hidden = true; });
  $('#recovery-notice-close').onclick = dismissRecoveryNotice;
  $('#recovery-notice-ok').onclick = dismissRecoveryNotice;
  $('#recovery-notice').addEventListener('click', (event) => {
    if (event.target === $('#recovery-notice')) dismissRecoveryNotice();
  });
  $('#pat-save').onclick = savePat;
  $('#btn-status').onclick = openStatus;
  $('#btn-status-close').onclick = closeStatus;
  $('#scrim').onclick = closeStatus;
  $('#new-pill').onclick = async () => {
    state.pendingNew = 0;
    $('#new-pill').hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await loadData(false);                 // 强制拉最新数据并渲染（不只是重画旧数据）
    // 新条目高亮保留 6 秒后淡出
    setTimeout(() => {
      state.newIds.clear();
      document.querySelectorAll('.card.is-new').forEach((card) => card.classList.remove('is-new'));
    }, 6000);
  };
  // 手机切后台再回来时，浏览器会冻结定时器 → 恢复可见时立即刷新一次
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadData(true); });
  bindPrayer();
  updateSrcBtn();
}

// ---------------- 演示数据（真实数据缺失时兜底） ----------------
function mockItems() {
  const ago = (min) => new Date(Date.now() - min * 60e3).toISOString();
  return [
    { id: 'm1', source_key: 'romano', source_name: 'Fabrizio Romano', source_name_zh: '罗马诺', tier: 'T0', kind: 'tweet', text: "Manchester City have reached an agreement for the young midfielder, here we go! Medical scheduled for next week. 🩵 #MCFC", text_zh: '曼城已就这名年轻中场达成协议，here we go！体检安排在下周。🩵 #MCFC', url: 'https://x.com/FabrizioRomano', published_at: ago(12), badges: ['HERE_WE_GO', 'MEDICAL'], note_zh: '与维亚纳关系紧密' },
    { id: 'm2', source_key: 'samlee', source_name: 'Sam Lee (The Athletic)', source_name_zh: 'TA·跟队 Sam Lee', tier: 'T0', kind: 'tweet', text: 'City sources playing down the links this morning — no formal bid has been made at this stage.', text_zh: '曼城内部消息人士今早对相关传闻降温——现阶段还没有正式报价。', url: 'https://x.com/SamLee', published_at: ago(58), badges: ['BID'], note_zh: '需鉴别是否夹杂私货' },
    { id: 'm3', source_key: 'men_city', source_name: 'Manchester Evening News', source_name_zh: '曼彻斯特晚报', tier: 'T0', kind: 'article', text: 'Man City transfer news LIVE: Every done deal and the latest on incomings and outgoings at the Etihad', text_zh: '曼城转会新闻直播：伊蒂哈德的每一笔已完成交易，以及最新的引援与离队动态', url: 'https://www.manchestereveningnews.co.uk/', published_at: ago(95), badges: ['DONE_DEAL'] },
    { id: 'm4', source_key: 'mcgrath', source_name: 'Mike McGrath (Telegraph)', source_name_zh: '电讯报·McGrath', tier: 'T0', kind: 'tweet', text: 'EXCL: Manchester City open talks over new deal for academy graduate, with release clause discussed.', text_zh: '独家：曼城开始就一名青训毕业生的新合同展开谈判，讨论中包含解约金条款。', url: 'https://x.com/mcgrathmike', published_at: ago(150), badges: ['EXCLUSIVE'], note_zh: '电讯报名记（原图标注 T0）' },
    { id: 'm5', source_key: 'jacobs', source_name: 'Ben Jacobs', source_name_zh: 'Ben Jacobs', tier: 'T1', kind: 'tweet', text: 'Understand personal terms are not expected to be an issue should Manchester City firm up their interest.', text_zh: '据了解，如果曼城的兴趣变得实质化，个人条款预计不会成为问题。', url: 'https://x.com/JacobsBen', published_at: ago(230), badges: ['PERSONAL_TERMS'], note_zh: '罗马诺狗腿' },
    { id: 'm6', source_key: 'moretto', source_name: 'Matteo Moretto', source_name_zh: '莫雷托', tier: 'T1', kind: 'tweet', text: 'Manchester City siguen muy atentos a la situación del delantero. Lo cuento en Fichajes.', text_zh: '曼城仍在密切关注这名前锋的情况。详见 Fichajes 专栏。', url: 'https://x.com/MatteMoretto', published_at: ago(60 * 26), badges: [], note_zh: '前 Relevo 首席' },
    { id: 'm7', source_key: 'guardian_city', source_name: 'The Guardian - Man City', source_name_zh: '卫报', tier: 'T2', kind: 'article', text: 'Manchester City weigh up move for defender as Guardiola plans squad refresh', text_zh: '曼城权衡引进这名后卫，瓜迪奥拉计划阵容换血', url: 'https://www.theguardian.com/football/manchestercity', published_at: ago(60 * 28), badges: [] },
    { id: 'm8', source_key: 'plettenberg', source_name: 'Florian Plettenberg (Sky DE)', source_name_zh: '德国天空·普拉滕伯格', tier: 'T2', kind: 'tweet', text: 'News: Manchester City have submitted an official bid. Player side open to the move. More to follow on @SkySportDE.', text_zh: '消息：曼城已提交正式报价。球员方面对转会持开放态度。更多详情见 @SkySportDE。', url: 'https://x.com/Plettigoal', published_at: ago(60 * 30), badges: ['BID', 'OFFICIAL'] },
    { id: 'm9', source_key: 'city_xtra', source_name: 'City Xtra', source_name_zh: 'City Xtra', tier: 'ITK', kind: 'tweet', text: 'Hearing positive noises around the Etihad regarding a midfield addition before the window closes. 👀', text_zh: '听说伊蒂哈德内部对窗口关闭前补强中场的前景相当乐观。👀', url: 'https://x.com/City_Xtra', published_at: ago(60 * 49), badges: [], note_zh: '曼城圈聚合号·示例' },
    { id: 'm10', source_key: 'nixon', source_name: 'Alan Nixon', source_name_zh: 'Alan Nixon', tier: 'T2', kind: 'tweet', text: 'City. Keeping tabs on League One youngster for the academy set-up. Early days.', text_zh: '曼城正在为青训体系考察一名英甲小将。仍处早期阶段。', url: 'https://x.com/reluctantnicko', published_at: ago(60 * 52), badges: ['YOUTH'], note_zh: '仅限青训消息可信' },
  ];
}

// ---------------- 启动 ----------------
bind();
renderCountdown();
recordRequestedShareVisit();
setInterval(renderCountdown, 1000);
loadData(false).finally(() => {
  scheduleDeferredReactionSnapshot();
  const surveyId = requestedSurveyId();
  if (surveyId) {
    acknowledgeSurveyInvite(surveyId);
    openSurvey(surveyId);
  } else {
    scheduleSurveyInvite();
  }
});
setInterval(() => loadData(true), REFRESH_MS);
