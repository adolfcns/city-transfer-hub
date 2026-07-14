// 把 D1 的全站表情次数保存成随页面发布的同源快照。
// 中国访客暂时连不上实时接口时，仍能看到最近一次发布时的次数。
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUTPUT = resolve(ROOT, 'data/reactions.json');
const LIVE_URL = process.env.REACTIONS_ENDPOINT || 'https://city-transfer-hub.pages.dev/reactions';
const PREVIOUS_URL = process.env.PREV_REACTIONS_URL || '';
const KEYS = ['fire', 'heart', 'watch', 'wild', 'doubt'];

function normalize(payload) {
  const counts = {};
  for (const [id, value] of Object.entries(payload?.counts || {})) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !value || typeof value !== 'object') continue;
    counts[id] = {};
    for (const key of KEYS) {
      const n = Number(value[key] || 0);
      counts[id][key] = Number.isSafeInteger(n) && n >= 0 ? n : 0;
    }
  }
  return { updated_at: new Date().toISOString(), counts };
}

async function fetchJson(url) {
  if (!url) return null;
  const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
    headers: { Origin: 'https://adolfcns.github.io' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.ok === false || !data.counts) throw new Error('invalid response');
  return normalize(data);
}

let snapshot = null;
try {
  snapshot = await fetchJson(LIVE_URL);
  console.log(`[reactions] 实时快照 ${Object.keys(snapshot.counts).length} 条消息`);
} catch (error) {
  console.warn(`[reactions] 实时接口不可用：${error.message}`);
}
if (!snapshot && PREVIOUS_URL) {
  try {
    snapshot = await fetchJson(PREVIOUS_URL);
    console.log(`[reactions] 沿用上次快照 ${Object.keys(snapshot.counts).length} 条消息`);
  } catch (error) {
    console.warn(`[reactions] 上次快照不可用：${error.message}`);
  }
}
snapshot ||= { updated_at: null, counts: {} };
await mkdir(resolve(ROOT, 'data'), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(snapshot)}\n`, 'utf8');
