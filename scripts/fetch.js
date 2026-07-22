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
import { fetchSource, buildDomainMap, fetchFocusGnews } from './lib/sources.js';
import { htmlToText } from './lib/rss.js';
import { makeMatchers, passFilter, detectBadges, makeId, mergeItems } from './lib/pipeline.js';
import { selectTwitterSources, runAdaptiveTwitterSchedule } from './lib/schedule.js';
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
  const focusTargets = cfg.focus_targets || [];
  // 焦点对象的别名并入热门名单：命中名字的消息（含别队动态）在源头就放行
  const matchers = makeMatchers({
    ...cfg,
    hot_players: [...(cfg.hot_players || []), ...focusTargets.flatMap((t) => t.aliases || [])],
  });
  // 给条目打 🎯 焦点标记（每轮全量重算，换焦点后旧标记自动消失）
  const tagFocus = (it) => {
    const hay = `${it.text || ''} ${it.text_zh || ''}`.toLowerCase();
    const hit = focusTargets
      .filter((t) => (t.aliases || []).some((a) => hay.includes(String(a).toLowerCase())))
      .map((t) => t.key);
    if (hit.length) it.focus = hit; else delete it.focus;
  };
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
    // 之前漏进来的无关内容（如世界杯闲聊）会被清出去。焦点对象的消息一律豁免。
    .filter((it) => {
      if (matchers.isExcluded(it.text)) return false;
      tagFocus(it);
      if (it.focus?.length) return true;
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
      return { ok: false, disabled: true };
    }
    try {
      const entries = (await fetchSource(src, ctx)) || [];
      rawBySource.set(src.key, entries);
      if (src.type === 'twitter' && entries.length === 0) {
        statusList.push({ key: src.key, name: src.name, name_zh: src.name_zh, tier: src.tier, type: src.type, enabled: true, ok: false, items: 0, last_success: prev?.last_success || null, error: '上游返回空时间线，疑似限流；保留历史数据等待下轮', throttled: true });
        console.warn(`[empty] ${src.key}: 上游返回 0 条，按疑似限流处理`);
        return { ok: false, throttled: true };
      }
      statusList.push({ key: src.key, name: src.name, name_zh: src.name_zh, tier: src.tier, type: src.type, enabled: true, ok: true, items: entries.length, last_success: new Date().toISOString(), error: null });
      console.log(`[ok] ${src.key}: ${entries.length} 条`);
      return { ok: true, items: entries.length };
    } catch (e) {
      const message = String(e.message || e).slice(0, 200);
      const throttled = /(?:^|\D)429(?:\D|$)|rate.?limit|too many requests|限流/i.test(message);
      statusList.push({ key: src.key, name: src.name, name_zh: src.name_zh, tier: src.tier, type: src.type, enabled: true, ok: false, items: 0, last_success: prev?.last_success || null, error: message, ...(throttled ? { throttled: true } : {}) });
      console.warn(`[fail] ${src.key}: ${message}`);
      return { ok: false, throttled, error: message };
    }
  };

  // RSS/GNews 并发抓；X 重点账号每轮优先抓，其余按半小时槽轮换。
  await mapLimit(otherSources, 5, runOne);
  if (!rsshubUrl) {
    for (const src of twitterSources) await runOne(src);
  } else {
    const slot = Number.isFinite(Number(process.env.TWITTER_ROTATION_SLOT))
      ? Number(process.env.TWITTER_ROTATION_SLOT)
      : Math.floor(Date.now() / (30 * 60 * 1000));
    const schedule = selectTwitterSources(twitterSources, settings, slot);
    const delayMs = Math.max(0, Number(settings.twitter_request_delay_ms) || 2500);
    console.log(`[twitter] 每轮必抓 ${schedule.everyRun.length} 个（ITK/T0/T1 + 斯基拉） | T2 优先组 ${schedule.groupIndex + 1}/${schedule.groupCount}: ${schedule.due.map((s) => s.key).join(', ') || '无'} | 无冲突则补抓 ${schedule.overflow.length} 个`);
    const result = await runAdaptiveTwitterSchedule(
      schedule,
      runOne,
      () => new Promise((resolve) => setTimeout(resolve, delayMs)),
    );
    console.log(`[twitter] 实际请求 ${result.attempted.length}/${twitterSources.length} 个 | ${result.conflicted ? `检测到冲突，延后 ${result.deferred.length} 个 T2` : '未检测到冲突，本轮已全抓'}`);
    for (const src of result.deferred) {
      const prev = prevStatusMap.get(src.key);
      statusList.push({
        key: src.key,
        name: src.name,
        name_zh: src.name_zh,
        tier: src.tier,
        type: src.type,
        enabled: true,
        ok: true,
        items: prev?.items || 0,
        last_success: prev?.last_success || null,
        error: null,
        deferred: true,
        deferred_reason: '本轮检测到上游冲突，留待下一轮优先组继续',
        rotation_group: schedule.groupIndex + 1,
        rotation_groups: schedule.groupCount,
      });
    }
  }

  // 焦点对象专属检索（开放搜索 + 白名单判级，别队动态也能进来）
  const domainMap = buildDomainMap(sources);
  const focusEntries = [];
  for (const t of focusTargets) {
    const key = `focus_${t.key}`;
    const prev = prevStatusMap.get(key);
    try {
      const entries = await fetchFocusGnews(t, domainMap);
      // 质量闸：标题必须真的含他的名字（防止 Google 按正文匹配塞进无关综述）
      const strict = entries.filter((e) =>
        (t.aliases || []).some((a) => e.text.toLowerCase().includes(String(a).toLowerCase())),
      );
      focusEntries.push(...strict);
      statusList.push({ key, name: `Focus: ${t.name}`, name_zh: `焦点·${t.name_zh}`, tier: '🎯', type: 'gnews', enabled: true, ok: true, items: strict.length, last_success: new Date().toISOString(), error: null });
      console.log(`[ok] ${key}: ${strict.length} 条（白名单内）`);
    } catch (e) {
      statusList.push({ key, name: `Focus: ${t.name}`, name_zh: `焦点·${t.name_zh}`, tier: '🎯', type: 'gnews', enabled: true, ok: false, items: 0, last_success: prev?.last_success || null, error: String(e.message || e).slice(0, 200) });
      console.warn(`[fail] ${key}: ${e.message}`);
    }
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
  // 焦点检索的条目：借用命中媒体的名称与分级入库（不做曼城过滤——别队动态正是目的）
  for (const e of focusEntries) {
    if (!e.url || !e.text) continue;
    if (matchers.isExcluded(e.text)) continue;
    if (new Date(e.published_at).getTime() < cutoff) continue;
    const id = makeId(e.url);
    if (knownIds.has(id) || incoming.some((x) => x.id === id)) continue;
    const o = e.outlet;
    incoming.push({
      id,
      source_key: o.key,
      source_name: o.name,
      source_name_zh: o.name_zh || o.name,
      tier: o.tier,
      kind: 'article',
      text: e.text,
      text_zh: null,
      url: e.url,
      published_at: e.published_at,
      badges: detectBadges(e.text),
      note_zh: o.note_zh || undefined,
    });
  }
  // 回填每个源"本轮新入库"条数（面板显示 抓X·入Y，避免误读）
  const admittedBySrc = {};
  for (const it of incoming) admittedBySrc[it.source_key] = (admittedBySrc[it.source_key] || 0) + 1;
  for (const s of statusList) s.admitted = admittedBySrc[s.key] || 0;

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
  // 焦点标记全量重算（翻译后的中文别名也能命中）
  merged.forEach(tagFocus);
  merged.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  const finalItems = merged.slice(0, settings.max_items ?? 2000);
  statusList.sort((a, b) => (a.tier > b.tier ? 1 : a.tier < b.tier ? -1 : a.key.localeCompare(b.key)));

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    resolve(DATA_DIR, 'items.json'),
    JSON.stringify({
      generated_at: new Date().toISOString(),
      twitter_enabled: Boolean(rsshubUrl),
      focus_targets: focusTargets.map(({ key, name, name_zh, desc_zh }) => ({ key, name, name_zh, desc_zh })),
      sources: sources.map(({ key, name, name_zh, tier, type }) => ({ key, name, name_zh, tier, type })),
      items: finalItems,
    }),
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
