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
const LIBRARY_KEY = 'cth_library_v1';
const PRAYER_KEY = 'cth_city_prayer_v1';
const ITEM_REACTIONS_KEY = 'cth_item_reactions_v1';
const PLAYER_FOLLOWS_KEY = 'cth_player_follows_v1';
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
const FEED_BATCH_SIZE = 24;
const PINNED_RUMOR_LIMIT = 30;
const SEARCH_DEBOUNCE_MS = 140;

// ---------------- 状态 ----------------
const state = {
  items: [],
  generatedAt: null,
  twitterEnabled: null,
  isDemo: false,
  status: null,
  sourceCatalog: [],
  focusTargets: [],
  seenIds: new Set(),
  newIds: new Set(),
  pendingNew: 0,
  library: loadLibrary(),
  playerFollows: loadPlayerFollows(),
  reactionCounts: {},
  reactionPrefs: loadReactionPrefs(),
  reactionEndpoint: null,
  filters: loadFilters(),
};
let feedItems = [];
let feedCursor = 0;
let feedLastDay = null;
let feedObserver = null;
let feedAppending = false;
let feedGeneration = 0;
let searchRenderTimer = null;
const reactionLiveLoaded = new Set();
const reactionReadQueue = new Set();
const reactionInFlight = new Set();
let reactionReadTimer = null;
let reactionSnapshotLoaded = false;
let reactionPendingFlush = false;
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
  setTimeout(() => target.classList.remove('shared-message-target'), 4200);
}

const SHARE_CARD_WIDTH = 1080;
const SHARE_CARD_HEIGHT = 1440;
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

function shareCardFilename(it) {
  const source = String(it.source_name_zh || it.source_name || '消息').replace(/[\\/:*?"<>|]/g, '-').slice(0, 24);
  return `曼城转会情报-${source}-${Date.now()}.png`;
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

function showShareCardSavePreview(blob, filename) {
  const url = URL.createObjectURL(blob);
  const overlay = el('div', 'share-save-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '保存分享图片');
  const panel = el('div', 'share-save-panel');
  const title = el('strong', 'share-save-title', '保存到手机');
  const hint = el('p', 'share-save-hint', '若浏览器没有自动保存，请长按下方图片，选择“保存图片”或“存储到相册”。');
  const image = el('img', 'share-save-image');
  image.src = url;
  image.alt = '当前消息的曼城转会分享图片';
  const controls = el('div', 'share-save-controls');
  const download = el('a', 'share-save-download', '↓ 再次下载');
  download.href = url;
  download.download = filename;
  const close = el('button', 'share-save-close', '完成');
  close.type = 'button';
  const dismiss = () => {
    overlay.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };
  close.onclick = dismiss;
  overlay.onclick = (event) => { if (event.target === overlay) dismiss(); };
  controls.append(download, close);
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

function buildLibraryActions(it, compact = false) {
  const id = itemId(it);
  const actions = el('div', compact ? 'library-actions compact' : 'library-actions');
  const share = buildCopyLinkButton(it, compact);
  const save = buildSaveImageButton(it, compact);
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
  actions.append(share, save, favorite, read);
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
  if (count < 10000) return 500;
  return 1000;
}

function nextPrayerMilestone(count) {
  const step = prayerMilestoneStep(count);
  const target = Math.ceil((count + 1) / step) * step;
  return { target, remaining: Math.max(0, target - count), step };
}

function renderPrayerCount(localCount, globalCount = null, syncState = 'loading') {
  const button = $('#city-prayer');
  const hasGlobal = syncState !== 'error' && Number.isSafeInteger(globalCount) && globalCount >= 0;
  const milestone = hasGlobal ? nextPrayerMilestone(globalCount) : null;
  const status = hasGlobal
    ? `全站 ${compactCount(globalCount)} 次 · 距 ${compactCount(milestone.target)} 还差 ${compactCount(milestone.remaining)}`
    : syncState === 'error' ? '全站同步暂不可用' : '全站次数加载中';
  $('#prayer-count').textContent = status;
  const accessible = hasGlobal
    ? `蓝月集合，冲击 ${milestone.target} 次好运里程碑。点击木鱼，为曼城增加一次好运。全站已送出 ${globalCount} 次，距离目标还差 ${milestone.remaining} 次。`
    : `蓝月集合，点击木鱼为曼城增加一次好运。${syncState === 'error' ? '全站同步暂不可用。' : '全站次数加载中。'}`;
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
    toast('咚！你的这份好运正在汇入蓝月 💙');
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
        const { target, remaining } = nextPrayerMilestone(globalCount);
        toast(achieved
          ? `咚！达成 ${globalCount.toLocaleString('zh-CN')} 次蓝月好运里程碑 💙`
          : `咚！好运已汇入全站 💙 距 ${target.toLocaleString('zh-CN')} 次还差 ${remaining.toLocaleString('zh-CN')} 次`);
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

  fetchJSON(STATUS_URL).then((s) => {
    state.status = s;
    buildSourceMenu();
    updateSrcBtn();
    renderStatusDot();
  }).catch(() => {});
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
  feed.textContent = '';
  const pinned = pinnedStripItems();
  const pinnedIds = shouldShowPinnedStrip(pinned)
    ? new Set(pinned.slice(0, PINNED_RUMOR_LIMIT).map(itemId))
    : null;
  feedItems = state.items.filter(passFilter).filter((it) => !pinnedIds?.has(itemId(it)));
  const sharedId = requestedMessageId();
  const sharedIndex = sharedId ? feedItems.findIndex((it) => itemId(it) === sharedId) : -1;
  if (sharedIndex > 0) feedItems.unshift(...feedItems.splice(sharedIndex, 1));
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
    return;
  }
  appendNextFeedBatch();
}

function appendNextFeedBatch() {
  if (feedAppending || feedCursor >= feedItems.length) return;
  feedAppending = true;
  stopFeedObserver();
  $('#feed-more')?.remove();
  $('#feed-end')?.remove();

  const feed = $('#feed');
  const fragment = document.createDocumentFragment();
  const end = Math.min(feedCursor + FEED_BATCH_SIZE, feedItems.length);
  const batchItems = feedItems.slice(feedCursor, end);
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
  queueReactionCounts(batchItems);
  feedAppending = false;

  if (feedCursor >= feedItems.length) {
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
  searchRenderTimer = setTimeout(() => {
    searchRenderTimer = null;
    renderFocusZone();
    renderFeed();
  }, SEARCH_DEBOUNCE_MS);
}

// ---------------- 重点绯闻置顶横滑栏 ----------------
function pinnedStripItems() {
  const targetKeys = new Set((state.focusTargets || []).map((target) => target.key));
  if (targetKeys.size === 0) return [];
  const items = state.items
    .filter((it) => (it.focus || []).some((key) => targetKeys.has(key)))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  const sharedId = requestedMessageId();
  const sharedIndex = sharedId ? items.findIndex((it) => itemId(it) === sharedId) : -1;
  if (sharedIndex > 0) items.unshift(...items.splice(sharedIndex, 1));
  return items;
}

function shouldShowPinnedStrip(items = pinnedStripItems()) {
  const f = state.filters;
  return items.length > 0
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

function renderFocusZone() {
  const zone = $('#focus-zone');
  const allPinned = pinnedStripItems();
  zone.textContent = '';
  zone.hidden = !shouldShowPinnedStrip(allPinned);
  if (zone.hidden) return;

  const visiblePinned = allPinned.filter((it) => !state.library.hiddenPinned.has(itemId(it)));
  const hiddenCount = allPinned.length - visiblePinned.length;
  const targets = state.focusTargets || [];
  const activeTargets = targets.filter((target) => allPinned.some((it) => (it.focus || []).includes(target.key)));
  const targetNames = activeTargets.map((target) => target.name_zh || target.name).join(' · ');
  const displayed = visiblePinned.slice(0, PINNED_RUMOR_LIMIT);

  const head = el('div', 'focus-strip-head');
  head.appendChild(el('h2', 'focus-strip-title', `📌 重点绯闻${targetNames ? ` · ${targetNames}` : ''}`));
  head.appendChild(el('span', 'focus-strip-total', hiddenCount > 0
    ? `剩余 ${visiblePinned.length} · 隐藏 ${hiddenCount}`
    : `共 ${allPinned.length} 条`));
  if (hiddenCount > 0) {
    const restore = el('button', 'focus-strip-restore', '恢复');
    restore.type = 'button';
    restore.title = `恢复已隐藏的 ${hiddenCount} 条专区消息`;
    restore.setAttribute('aria-label', restore.title);
    restore.onclick = () => restoreHiddenPinned(allPinned);
    head.appendChild(restore);
  }
  const progress = el('span', 'focus-strip-progress', displayed.length ? `1 / ${displayed.length}` : '0 / 0');
  head.appendChild(progress);
  zone.appendChild(head);

  if (activeTargets.length > 0) {
    const followRow = el('div', 'focus-follow-row');
    const followButtons = el('div', 'focus-follow-buttons');
    for (const target of activeTargets) {
      const name = focusTargetName(target);
      const following = state.playerFollows.has(String(target.key));
      const follow = el('button', `focus-follow${following ? ' on' : ''}`,
        following ? `🔔 已关注 ${name}` : `＋ 关注 ${name}`);
      follow.type = 'button';
      follow.setAttribute('aria-pressed', String(following));
      follow.title = following
        ? `取消关注 ${name}`
        : `关注 ${name}，出现 T0、报价或官宣时提醒`;
      follow.onclick = () => { togglePlayerFollow(target); };
      followButtons.appendChild(follow);
    }
    followRow.appendChild(followButtons);
    followRow.appendChild(el('span', 'focus-follow-hint', '出现 T0、报价或官宣时提醒'));
    zone.appendChild(followRow);
  }

  if (displayed.length === 0) {
    zone.appendChild(el('div', 'focus-strip-empty', '置顶消息已全部读完并隐藏，可点击上方“恢复”重新查看。'));
    return;
  }

  const track = el('div', 'focus-track');
  for (const it of displayed) {
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

    if (activeTargets.length > 1) {
      const names = activeTargets
        .filter((target) => (it.focus || []).includes(target.key))
        .map((target) => target.name_zh || target.name)
        .join(' · ');
      if (names) card.appendChild(el('div', 'pinned-target', `🎯 ${names}`));
    }

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
    pinnedActions.append(link, buildCopyLinkButton(it), buildSaveImageButton(it));
    card.appendChild(pinnedActions);
    card.appendChild(buildReactionBar(it, true, 'pinned'));
    track.appendChild(card);
  }

  let frame = 0;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const first = track.querySelector('.pinned-card');
      const step = first ? first.getBoundingClientRect().width + 9 : track.clientWidth;
      const current = Math.min(displayed.length, Math.max(1, Math.round(track.scrollLeft / step) + 1));
      progress.textContent = `${current} / ${displayed.length}`;
    });
  }, { passive: true });

  zone.appendChild(track);
  queueReactionCounts(displayed);
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
  card.appendChild(buildReactionBar(it));
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
  $('#search').oninput = (e) => {
    state.filters.search = e.target.value.trim();
    scheduleSearchRender();
  };
  $('#src-btn').onclick = (e) => { e.stopPropagation(); $('#src-menu').hidden = !$('#src-menu').hidden; };
  document.addEventListener('click', (e) => {
    if (!$('#src-select').contains(e.target)) $('#src-menu').hidden = true;
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
  $('#mark-all-read').onclick = () => {
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
loadReactionSnapshot();
renderCountdown();
setInterval(renderCountdown, 60e3);
loadData(false);
setInterval(() => loadData(true), REFRESH_MS);
