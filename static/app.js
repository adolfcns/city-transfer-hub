/* 曼城转会情报站 - 前端逻辑（无框架，纯静态） */
'use strict';

// ---------------- 配置 ----------------
const DATA_URL = './data/items.json';
const STATUS_URL = './data/status.json';
const REFRESH_MS = 90 * 1000;
// 转会窗关闭时间（到点自动切到下一个）
const WINDOWS = [
  { label: '夏窗关闭', ts: Date.parse('2026-09-01T17:00:00Z') },
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
const HOT_BADGES = new Set(['HERE_WE_GO', 'OFFICIAL', 'EXCLUSIVE', 'DONE_DEAL']);
const LIBRARY_KEY = 'cth_library_v1';
const PRAYER_KEY = 'cth_city_prayer_v1';

// ---------------- 状态 ----------------
const state = {
  items: [],
  generatedAt: null,
  twitterEnabled: null,
  isDemo: false,
  status: null,
  seenIds: new Set(),
  newIds: new Set(),
  pendingNew: 0,
  library: loadLibrary(),
  filters: loadFilters(),
};

function loadFilters() {
  const def = { tiers: ['T0', 'T1', 'T2', 'ITK'], sources: null, search: '', onlyHot: false, lang: 'zh', focusKey: null, libraryView: 'all' };
  try {
    const saved = JSON.parse(localStorage.getItem('cth_filters') || 'null');
    const loaded = saved ? Object.assign(def, saved, { search: '' }) : def;
    if (!['all', 'unread', 'favorites'].includes(loaded.libraryView)) loaded.libraryView = 'all';
    return loaded;
  } catch { return def; }
}
function saveFilters() {
  const { tiers, sources, onlyHot, lang, libraryView } = state.filters;
  localStorage.setItem('cth_filters', JSON.stringify({ tiers, sources, onlyHot, lang, libraryView }));
}
function loadLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(LIBRARY_KEY) || 'null');
    return {
      favorites: new Set(Array.isArray(saved?.favorites) ? saved.favorites.map(String) : []),
      read: new Set(Array.isArray(saved?.read) ? saved.read.map(String) : []),
    };
  } catch {
    return { favorites: new Set(), read: new Set() };
  }
}
function saveLibrary() {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify({
      favorites: [...state.library.favorites],
      read: [...state.library.read],
    }));
  } catch { /* 浏览器禁用本机存储时，本次访问内仍可使用 */ }
}
function itemId(it) {
  return String(it.id || it.url);
}
function toggleFavorite(it) {
  const id = itemId(it);
  if (state.library.favorites.has(id)) state.library.favorites.delete(id);
  else state.library.favorites.add(id);
  saveLibrary();
  render();
}
function toggleRead(it) {
  const id = itemId(it);
  if (state.library.read.has(id)) state.library.read.delete(id);
  else state.library.read.add(id);
  saveLibrary();
  render();
}
function markRead(it) {
  const id = itemId(it);
  if (state.library.read.has(id)) return;
  state.library.read.add(id);
  saveLibrary();
  updateLibraryBar();
}
function buildLibraryActions(it, compact = false) {
  const id = itemId(it);
  const actions = el('div', compact ? 'library-actions compact' : 'library-actions');
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
  actions.append(favorite, read);
  return actions;
}
function updateLibraryBar() {
  const currentIds = new Set(state.items.map(itemId));
  const favoriteCount = [...state.library.favorites].filter((id) => currentIds.has(id)).length;
  const unreadCount = state.items.reduce((n, it) => n + (state.library.read.has(itemId(it)) ? 0 : 1), 0);
  $('#count-all').textContent = String(state.items.length);
  $('#count-unread').textContent = String(unreadCount);
  $('#count-favorites').textContent = String(favoriteCount);
  document.querySelectorAll('[data-library-view]').forEach((button) => {
    const active = button.dataset.libraryView === state.filters.libraryView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const markAll = $('#mark-all-read');
  markAll.disabled = unreadCount === 0;
  markAll.textContent = unreadCount === 0 ? '全部已读' : '全部标为已读';
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

function renderPrayerCount(localCount, globalCount = null) {
  const button = $('#city-prayer');
  const hasGlobal = Number.isSafeInteger(globalCount) && globalCount >= 0;
  $('#prayer-count').textContent = hasGlobal
    ? `全站已敲 ${compactCount(globalCount)} 次`
    : '全站次数加载中';
  button.setAttribute('aria-label', hasGlobal
    ? `点击曼城木鱼，为球员带来好运；全站已敲 ${globalCount} 次`
    : '点击曼城木鱼，为球员带来好运；全站次数加载中');
}

function bindPrayer() {
  const button = $('#city-prayer');
  let localCount = loadPrayerCount();
  let globalCount = null;
  let requestInFlight = false;
  renderPrayerCount(localCount, globalCount);

  const requestPrayer = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      return await fetch(PRAYER_ENDPOINT, { method, cache: 'no-store', signal: controller.signal });
    } finally { clearTimeout(timer); }
  };

  requestPrayer('GET').then(async (res) => {
    if (!res.ok) return;
    const data = await res.json();
    if (Number.isSafeInteger(data.count) && data.count >= 0) {
      globalCount = data.count;
      renderPrayerCount(localCount, globalCount);
    }
  }).catch(() => { /* workers.dev 不可达时继续显示本机次数 */ });

  button.onclick = async () => {
    if (requestInFlight) return;
    requestInFlight = true;
    button.disabled = true;
    localCount = Math.min(localCount + 1, 999999);
    savePrayerCount(localCount);
    renderPrayerCount(localCount, globalCount);
    button.classList.remove('hit');
    requestAnimationFrame(() => button.classList.add('hit'));
    setTimeout(() => button.classList.remove('hit'), 360);
    try { navigator.vibrate?.(30); } catch { /* 部分浏览器不支持轻触震动 */ }
    toast('咚！已为曼城球员带来好运 💙');
    try {
      const res = await requestPrayer('POST');
      const data = await res.json().catch(() => ({}));
      if (Number.isSafeInteger(data.count) && data.count >= 0) {
        globalCount = data.count;
        renderPrayerCount(localCount, globalCount);
      }
      if (res.ok && Number.isSafeInteger(globalCount)) {
        toast(`咚！好运已汇入全站 💙 全站已敲 ${globalCount.toLocaleString('zh-CN')} 次`);
      } else if (res.status === 429) toast('好运收到啦，稍慢一点再敲 💙');
      else toast('本次好运已保存在本机，全站计数暂时不可用');
    } catch {
      toast('本次好运已保存在本机，全站计数暂未连接');
    } finally {
      requestInFlight = false;
      button.disabled = false;
    }
  };
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

// ---------------- 数据加载 ----------------
async function fetchJSON(url) {
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadData(isRefresh = false) {
  let data;
  try {
    data = await fetchJSON(DATA_URL);
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

  const freshIds = (data.items || []).filter((it) => !state.seenIds.has(it.id)).map((it) => it.id);
  if (isRefresh && freshIds.length > 0 && state.seenIds.size > 0) {
    freshIds.forEach((id) => state.newIds.add(id));
    state.pendingNew = state.newIds.size;   // 用集合大小，不累加，避免虚高
    showNewPill();
  }
  for (const it of data.items || []) state.seenIds.add(it.id);

  state.items = data.items || [];
  state.generatedAt = data.generated_at;
  state.twitterEnabled = data.twitter_enabled;
  state.focusTargets = data.focus_targets || [];
  $('#updated-at').textContent = `更新于 ${relTime(data.generated_at)}`;

  buildSourceMenu();
  render();

  fetchJSON(STATUS_URL).then((s) => { state.status = s; renderStatusDot(); }).catch(() => {});
}

// ---------------- 筛选 ----------------
function currentSourceKeys() {
  return [...new Map(state.items.map((it) => [it.source_key, it])).values()]
    .sort((a, b) => (a.tier > b.tier ? 1 : -1));
}
function passFilter(it) {
  const f = state.filters;
  if (f.focusKey && !(it.focus || []).includes(f.focusKey)) return false;
  if (!f.tiers.includes(it.tier)) return false;
  if (f.sources && !f.sources.includes(it.source_key)) return false;
  if (f.onlyHot && !(it.badges || []).some((b) => HOT_BADGES.has(b))) return false;
  if (f.libraryView === 'unread' && state.library.read.has(itemId(it))) return false;
  if (f.libraryView === 'favorites' && !state.library.favorites.has(itemId(it))) return false;
  if (f.search) {
    const hay = `${it.text || ''} ${it.text_zh || ''} ${it.source_name} ${it.source_name_zh || ''}`.toLowerCase();
    if (!hay.includes(f.search.toLowerCase())) return false;
  }
  return true;
}

// ---------------- 渲染 ----------------
function render() {
  renderFocusZone();
  updateLibraryBar();
  const feed = $('#feed');
  feed.textContent = '';
  const items = state.items.filter(passFilter);

  // 选了中文/双语但一条译文都没有 → 提示需要配置翻译密钥
  const anyZh = state.items.some((it) => it.text_zh);
  $('#translate-banner').hidden = state.isDemo || anyZh || state.items.length === 0 || state.filters.lang === 'en';

  // tier 计数
  const counts = { T0: 0, T1: 0, T2: 0, ITK: 0 };
  for (const it of state.items) counts[it.tier] = (counts[it.tier] || 0) + 1;
  document.querySelectorAll('.tier-chip').forEach((chip) => {
    chip.querySelector('.cnt').textContent = counts[chip.dataset.tier] || 0;
  });

  if (items.length === 0) {
    const emptyText = state.filters.libraryView === 'favorites'
      ? '还没有收藏消息，点击卡片上的“☆ 收藏”即可加入'
      : state.filters.libraryView === 'unread'
        ? '当前没有未读消息'
        : '没有符合筛选条件的消息';
    feed.appendChild(el('div', 'empty', emptyText));
    return;
  }
  let lastDay = null;
  for (const it of items) {
    const dk = dayKey(it.published_at);
    if (dk !== lastDay) {
      feed.appendChild(el('div', 'day-sep', dayLabel(it.published_at)));
      lastDay = dk;
    }
    feed.appendChild(renderCard(it));
  }
}

// ---------------- 焦点专区 ----------------
function renderFocusZone() {
  const zone = $('#focus-zone');
  const targets = state.focusTargets || [];
  zone.hidden = targets.length === 0 || state.isDemo || state.filters.libraryView !== 'all';
  zone.textContent = '';
  if (zone.hidden) return;

  const todayKey = dayKey(new Date().toISOString());
  for (const t of targets) {
    const matched = state.items.filter((it) => (it.focus || []).includes(t.key));
    const todayCount = matched.filter((it) => dayKey(it.published_at) === todayKey).length;

    const card = el('div', 'focus-card');
    const head = el('div', 'focus-head');
    head.appendChild(el('div', 'focus-avatar', initialsOf(t.name)));
    const tt = el('div');
    tt.appendChild(el('div', 'focus-title', `🎯 ${t.name_zh} · 传闻追踪`));
    tt.appendChild(el('div', 'focus-desc', `${t.desc_zh || t.name} · 今日 ${todayCount} 条 / 共 ${matched.length} 条`));
    head.appendChild(tt);
    const hot = matched.filter((it) => it.tier === 'T0').length;
    if (hot > 0) head.appendChild(el('span', 'focus-count', `T0 已跟进 ${hot} 条`));
    const btn = el('button', `focus-btn${state.filters.focusKey === t.key ? ' on' : ''}`,
      state.filters.focusKey === t.key ? '正在只看他 ✕' : '只看他');
    btn.onclick = () => {
      state.filters.focusKey = state.filters.focusKey === t.key ? null : t.key;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    head.appendChild(btn);
    card.appendChild(head);

    if (matched.length === 0) {
      card.appendChild(el('div', 'focus-empty', '暂无相关消息，抓到会第一时间出现在这里'));
    } else {
      // 横滑卡片墙：每张卡一条完整消息
      const car = el('div', 'focus-carousel');
      for (const it of matched.slice(0, 12)) {
        const s = el('article', 'focus-slide');
        if (state.library.read.has(itemId(it))) s.classList.add('is-read');
        const h = el('div', 'fs-head');
        h.appendChild(el('span', `badge-tier ${TIER_CLASS[it.tier] || 't2'}`, it.tier));
        h.appendChild(el('span', 'fs-src', it.source_name_zh || it.source_name));
        h.appendChild(el('span', 'fs-time', relTime(it.published_at)));
        s.appendChild(h);
        s.appendChild(el('div', 'fs-text', state.filters.lang === 'en' ? (it.text || '') : (it.text_zh || it.text || '')));
        const fsFoot = el('div', 'fs-foot');
        const a = el('a', 'fs-link', it.kind === 'tweet' ? '查看原推 ↗' : '阅读原文 ↗');
        a.href = it.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.onclick = () => { markRead(it); requestAnimationFrame(render); };
        fsFoot.appendChild(a);
        fsFoot.appendChild(buildLibraryActions(it, true));
        s.appendChild(fsFoot);
        car.appendChild(s);
      }
      // 桌面端左右箭头（手机隐藏，手指滑）
      // 步长 = 一张卡 + 间距，正好落在吸附点上（否则强制吸附会弹回）
      const step = () => {
        const s = car.querySelector('.focus-slide');
        return s ? s.getBoundingClientRect().width + 10 : 310;
      };
      const prev = el('button', 'fs-nav', '‹');
      const next = el('button', 'fs-nav', '›');
      prev.title = '上一张'; next.title = '下一张';
      prev.onclick = () => { car.scrollLeft -= step(); };
      next.onclick = () => { car.scrollLeft += step(); };
      head.insertBefore(prev, btn);
      head.insertBefore(next, btn);
      card.appendChild(car);
    }
    zone.appendChild(card);
  }
}

function renderCard(it) {
  const card = el('article', `card ${TIER_CLASS[it.tier] || 't2'}`);
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
  link.onclick = () => { markRead(it); requestAnimationFrame(render); };
  foot.appendChild(link);
  if (it.dupes && it.dupes.length) {
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
const PRAYER_ENDPOINT = `${TRIGGER_ENDPOINT}prayer`;
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
  const days = Math.floor((w.ts - now) / 86400e3);
  const hours = Math.floor(((w.ts - now) % 86400e3) / 3600e3);
  n.textContent = days > 0 ? `距${w.label}还有 ${days} 天` : `距${w.label}仅剩 ${hours} 小时！`;
}

// ---------------- 事件绑定 ----------------
function bind() {
  document.querySelectorAll('.tier-chip').forEach((chip) => {
    const t = chip.dataset.tier;
    chip.classList.toggle('active', state.filters.tiers.includes(t));
    chip.onclick = () => {
      const f = state.filters;
      f.tiers = f.tiers.includes(t) ? f.tiers.filter((x) => x !== t) : [...f.tiers, t];
      chip.classList.toggle('active', f.tiers.includes(t));
      saveFilters(); render();
    };
  });
  $('#btn-legend').onclick = () => { const d = $('#legend-detail'); d.hidden = !d.hidden; };
  $('#search').oninput = (e) => { state.filters.search = e.target.value.trim(); render(); };
  $('#src-btn').onclick = (e) => { e.stopPropagation(); $('#src-menu').hidden = !$('#src-menu').hidden; };
  document.addEventListener('click', (e) => {
    if (!$('#src-select').contains(e.target)) $('#src-menu').hidden = true;
  });
  document.querySelectorAll('#lang-seg button').forEach((b) => {
    b.classList.toggle('active', b.dataset.lang === state.filters.lang);
    b.onclick = () => {
      state.filters.lang = b.dataset.lang;
      document.querySelectorAll('#lang-seg button').forEach((x) => x.classList.toggle('active', x === b));
      saveFilters(); render();
    };
  });
  const hot = $('#only-hot');
  hot.checked = state.filters.onlyHot;
  hot.onchange = () => { state.filters.onlyHot = hot.checked; saveFilters(); render(); };
  document.querySelectorAll('[data-library-view]').forEach((button) => {
    button.onclick = () => {
      state.filters.libraryView = button.dataset.libraryView;
      saveFilters();
      render();
    };
  });
  $('#mark-all-read').onclick = () => {
    for (const it of state.items) state.library.read.add(itemId(it));
    saveLibrary();
    render();
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
    setTimeout(() => { state.newIds.clear(); render(); }, 6000);
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
setInterval(renderCountdown, 60e3);
loadData(false);
setInterval(() => loadData(true), REFRESH_MS);
