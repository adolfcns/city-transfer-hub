// 主抓取器：读 sources.yaml → 抓取全部信源 → 过滤/去重/徽章/翻译 → data/items.json + status.json
//
// 环境变量:
//   RSSHUB_URL        RSSHub 地址（不设则跳过推文通道）
//   PREV_DATA_URL     上一次 items.json 的线上地址（CI 用，本地自动读 data/ 目录）
//   PREV_STATUS_URL   上一次 status.json 的线上地址
//   DEEPSEEK_API_KEY  翻译密钥（不设则跳过翻译）
//   PROXY_URL         代理（本地默认自动探测 127.0.0.1:7897）
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { initHttp, httpGet, mapLimit } from './lib/http.js';
import { fetchSource } from './lib/sources.js';
import { htmlToText } from './lib/rss.js';
import { makeMatchers, passFilter, detectBadges, makeId, mergeItems } from './lib/pipeline.js';
import { translateNew } from './lib/translate.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DATA_DIR = resolve(ROOT, 'data');

async function loadPrev(urlEnv, localFile) {
  const url = process.env[urlEnv];
  if (url) {
    try {
      const text = await httpGet(url, { retries: 0, timeout: 15000 });
      return JSON.parse(text);
    } catch (e) {
      console.warn(`[prev] 拉取 ${url} 失败（可能是首次运行）: ${e.message}`);
      return null;
    }
  }
  try {
    return JSON.parse(await readFile(resolve(DATA_DIR, localFile), 'utf8'));
  } catch { return null; }
}

async function main() {
  const t0 = Date.now();
  await initHttp();

  const cfg = YAML.parse(await readFile(resolve(ROOT, 'config/sources.yaml'), 'utf8'));
  const settings = cfg.settings || {};
  const matchers = makeMatchers(cfg);
  const rsshubUrl = process.env.RSSHUB_URL || '';
  const ctx = {
    rsshubUrl,
    excludeRetweets: settings.exclude_retweets !== false,
    excludeReplies: settings.exclude_replies !== false,
  };

  // 上一次的数据（保留历史 + 翻译缓存 + 连续失败计数）
  const prevData = await loadPrev('PREV_DATA_URL', 'items.json');
  const prevStatus = await loadPrev('PREV_STATUS_URL', 'status.json');
  const prevStatusMap = new Map((prevStatus?.sources || []).map((s) => [s.key, s]));

  // 信源 key → 配置，用于对旧数据重新套用当前过滤规则
  const srcByKey = new Map((cfg.sources || []).map((s) => [s.key, s]));
  const cutoff = Date.now() - (settings.days_keep ?? 14) * 86400e3;
  const kept = (prevData?.items || [])
    .filter((it) => new Date(it.published_at).getTime() >= cutoff)
    // 历史数据就地清洗：修复早期版本漏删的 HTML 代码，剔除漏网的纯转推
    .map((it) => ({ ...it, text: htmlToText(it.text) || it.text }))
    .filter((it) => !(it.kind === 'tweet' && /^RT[ :@]/i.test(it.text)))
    // 对旧数据重新套用当前过滤规则：信源改了 filter（如记者号改为只收曼城相关）后，
    // 之前漏进来的无关内容（如世界杯闲聊）会被清出去
    .filter((it) => {
      const src = srcByKey.get(it.source_key);
      if (!src) return true; // 信源已删除则保留旧条目
      return passFilter(src.filter || 'city+transfer', it.text, matchers);
    });
  // 历史条目的备注与当前配置同步（yaml 删了备注，旧条目上也立刻消失）
  for (const it of kept) it.note_zh = srcByKey.get(it.source_key)?.note_zh || undefined;
  const knownIds = new Set(kept.map((it) => it.id));
  console.log(`[prev] 保留历史条目 ${kept.length} 条`);

  // ---------- 抓取 ----------
  const sources = cfg.sources || [];
  const twitterSources = sources.filter((s) => s.type === 'twitter');
  const otherSources = sources.filter((s) => s.type !== 'twitter');
  const statusList = [];
  const rawBySource = new Map();

  const runOne = async (src) => {
    const prev = prevStatusMap.get(src.key);
    const enabled = src.type !== 'twitter' || Boolean(rsshubUrl);
    if (!enabled) {
      statusList.push({ key: src.key, name: src.name, name_zh: src.name_zh, tier: src.tier, type: src.type, enabled: false, ok: false, items: 0, last_success: prev?.last_success || null, error: null });
      return;
    }
    try {
      const entries = (await fetchSource(src, ctx)) || [];
      rawBySource.set(src.key, entries);
      statusList.push({ key: src.key, name: src.name, name_zh: src.name_zh, tier: src.tier, type: src.type, enabled: true, ok: true, items: entries.length, last_success: new Date().toISOString(), error: null });
      console.log(`[ok] ${src.key}: ${entries.length} 条`);
    } catch (e) {
      statusList.push({ key: src.key, name: src.name, name_zh: src.name_zh, tier: src.tier, type: src.type, enabled: true, ok: false, items: 0, last_success: prev?.last_success || null, error: String(e.message || e).slice(0, 200) });
      console.warn(`[fail] ${src.key}: ${e.message}`);
    }
  };

  // RSS/GNews 并发抓；推特顺序抓 + 间隔，防限流
  await mapLimit(otherSources, 5, runOne);
  for (const src of twitterSources) {
    await runOne(src);
    if (rsshubUrl) await new Promise((r) => setTimeout(r, 2000));
  }

  // ---------- 过滤 + 成品化 ----------
  const incoming = [];
  for (const src of sources) {
    const entries = rawBySource.get(src.key) || [];
    for (const e of entries) {
      if (!e.url || !e.text) continue;
      if (new Date(e.published_at).getTime() < cutoff) continue;
      const id = makeId(e.url);
      if (knownIds.has(id)) continue;
      if (!passFilter(src.filter || 'city+transfer', e.text, matchers)) continue;
      incoming.push({
        id,
        source_key: src.key,
        source_name: src.name,
        source_name_zh: src.name_zh || src.name,
        tier: src.tier,
        kind: e.kind,
        text: e.text,
        text_zh: null,
        url: e.url,
        published_at: e.published_at,
        badges: detectBadges(e.text),
        note_zh: src.note_zh || undefined,
      });
    }
  }
  // 同一批内按时间升序合并，保证越早发布的越先当"主条目"
  incoming.sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
  console.log(`[filter] 新增候选 ${incoming.length} 条`);

  // ---------- 去重合并 ----------
  const merged = mergeItems(kept, incoming);

  // ---------- 翻译（只翻没有译文的） ----------
  const nTranslated = await translateNew(merged, process.env.DEEPSEEK_API_KEY);
  if (process.env.DEEPSEEK_API_KEY) console.log(`[translate] 本次翻译 ${nTranslated} 条`);
  else console.log('[translate] 未配置 DEEPSEEK_API_KEY，跳过');

  // ---------- 输出 ----------
  merged.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  const finalItems = merged.slice(0, settings.max_items ?? 2000);
  statusList.sort((a, b) => (a.tier > b.tier ? 1 : a.tier < b.tier ? -1 : a.key.localeCompare(b.key)));

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    resolve(DATA_DIR, 'items.json'),
    JSON.stringify({ generated_at: new Date().toISOString(), twitter_enabled: Boolean(rsshubUrl), items: finalItems }),
  );
  await writeFile(
    resolve(DATA_DIR, 'status.json'),
    JSON.stringify({ updated_at: new Date().toISOString(), sources: statusList }),
  );

  const okCount = statusList.filter((s) => s.ok).length;
  console.log(`[done] ${finalItems.length} 条上线 | 信源 ${okCount}/${statusList.length} 正常 | 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  // 全部信源失败视为异常退出（避免拿空数据覆盖线上）
  if (okCount === 0) {
    console.error('[fatal] 所有信源均失败，退出码 1');
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
