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
import { fetchSource, buildDomainMap, fetchFocusGnews, fetchChelseaTransferGnews, fetchTrustedTransferGnews } from './lib/sources.js';
import { htmlToText } from './lib/rss.js';
import { makeMatchers, passFilter, detectBadges, makeId, mergeItems } from './lib/pipeline.js';
import { selectTwitterSources, runAdaptiveTwitterSchedule } from './lib/schedule.js';
import { translateNew } from './lib/translate.js';
import { buildPagedData } from './lib/paged-data.js';
import { CHELSEA_WATCH_QUERIES, classifyChelseaWatch, isChelseaCamaraFocus, isChelseaKoneFocus, prioritizeChelseaWatchItems } from './lib/chelsea-watch.js';
import { LIVERPOOL_SARR_QUERY, isLiverpoolSarrWatchItem, buildLiverpoolSarrWatchItems } from './lib/liverpool-sarr-watch.js';

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
  const chelseaWatchSources = cfg.chelsea_watch_sources || [];
  const liverpoolSarrSources = cfg.liverpool_sarr_watch_sources || [];
  const liverpoolSarrGlobalKeys = new Set(settings.liverpool_sarr_watch_global_source_keys || []);
  const liverpoolSarrAllowedKeys = new Set([...liverpoolSarrSources.map((source) => source.key), ...liverpoolSarrGlobalKeys]);
  const chelseaWatchGlobalKeys = new Set(settings.chelsea_watch_global_source_keys || []);
  const chelseaWatchEnzoOnlyKeys = new Set(settings.chelsea_watch_enzo_only_source_keys || []);
  const chelseaWatchDedicatedKeys = new Set(chelseaWatchSources.map((source) => source.key));
  const allowsChelseaWatchSource = (sourceKey, watchType) => (
    chelseaWatchDedicatedKeys.has(sourceKey)
    || chelseaWatchGlobalKeys.has(sourceKey)
    || (watchType === 'enzo_city' && chelseaWatchEnzoOnlyKeys.has(sourceKey))
  );
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
  const prevChelseaWatch = await loadPrev('PREV_CHELSEA_WATCH_URL', 'chelsea-watch.json');
  const prevLiverpoolSarrWatch = await loadPrev('PREV_LIVERPOOL_SARR_WATCH_URL', 'liverpool-sarr-watch.json');
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

  // 切尔西跟队记者使用独立白名单抓取，不进入普通曼城消息流。
  const chelseaWatchTimelineSources = chelseaWatchSources.filter((source) => source.type === 'twitter');
  const liverpoolSarrTimelineSources = liverpoolSarrSources.filter((source) => source.type === 'twitter');
  const radarTimelineSources = [...chelseaWatchTimelineSources, ...liverpoolSarrTimelineSources];
  if (!rsshubUrl) {
    for (const source of radarTimelineSources) await runOne(source);
  } else {
    const delayMs = Math.max(0, Number(settings.twitter_request_delay_ms) || 2500);
    console.log(`[transfer-watch] 抓取可信跟队 ${radarTimelineSources.length} 个`);
    for (const source of radarTimelineSources) {
      await runOne(source);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
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

  // 蓝桥引援雷达：文章只允许切尔西官方与权威跟队域名；普通媒体不会进入。
  const chelseaDomainMap = buildDomainMap(chelseaWatchSources.filter((source) => source.type !== 'twitter'));
  // 萨尔检索与蓝桥三路并行；每路超时 12 秒且不重试，不拉长抓取周期。
  const liverpoolSarrGnewsPromise = (async () => {
    const key = 'watch_liverpool_sarr';
    const status = { key, name: 'Liverpool Sarr watch', name_zh: '利物浦·萨尔追踪', tier: '🔍', type: 'gnews', enabled: true };
    try {
      const map = buildDomainMap(liverpoolSarrSources.filter((source) => source.type !== 'twitter'));
      const entries = (await fetchTrustedTransferGnews(map, LIVERPOOL_SARR_QUERY)).filter((entry) => isLiverpoolSarrWatchItem(entry.text));
      statusList.push({ ...status, ok: true, items: entries.length, last_success: new Date().toISOString(), error: null });
      return entries;
    } catch (error) {
      statusList.push({ ...status, ok: false, items: 0, last_success: prevStatusMap.get(key)?.last_success || null, error: String(error.message || error).slice(0, 200) });
      console.warn(`[fail] ${key}: ${error.message}`);
      return [];
    }
  })();
  const chelseaGnewsEntries = (await Promise.all(CHELSEA_WATCH_QUERIES.map(async (search) => {
    const { key, name, name_zh, query } = search;
    const status = { key, name, name_zh, tier: '🔍', type: 'gnews', enabled: true };
    try {
      const entries = (await fetchChelseaTransferGnews(chelseaDomainMap, query)).filter((entry) => (
        search.key === 'watch_chelsea_camara' ? isChelseaCamaraFocus(entry.text)
          : search.key === 'watch_chelsea_kone' ? isChelseaKoneFocus(entry.text) : classifyChelseaWatch(entry.text)
      ));
      statusList.push({ ...status, ok: true, items: entries.length, last_success: new Date().toISOString(), error: null });
      console.log(`[ok] ${key}: ${entries.length} 条（白名单内）`);
      return entries;
    } catch (e) {
      const prev = prevStatusMap.get(key);
      statusList.push({ ...status, ok: false, items: 0, last_success: prev?.last_success || null, error: String(e.message || e).slice(0, 200) });
      console.warn(`[fail] ${key}: ${e.message}`);
      return [];
    }
  }))).flat();
  const liverpoolSarrGnewsEntries = await liverpoolSarrGnewsPromise;

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

  // ---------- 蓝桥引援雷达独立数据流 ----------
  // 不写入普通曼城消息流；只复用相同信源、翻译和去重能力。
  const chelseaWatchCutoff = Date.now() - (settings.chelsea_watch_days_keep ?? 7) * 86400e3;
  const chelseaWatchKept = (prevChelseaWatch?.items || [])
    .filter((item) => new Date(item.published_at).getTime() >= chelseaWatchCutoff)
    .map((item) => ({ ...item, text: htmlToText(item.text) || item.text }))
    .filter((item) => {
      const watchType = classifyChelseaWatch(item.text);
      return watchType && allowsChelseaWatchSource(item.source_key, watchType);
    });
  const chelseaWatchKnownIds = new Set(chelseaWatchKept.map((item) => item.id));
  const chelseaWatchIncoming = [];
  const addChelseaWatchEntry = (entry, source) => {
    if (!entry?.url || !entry?.text || !source) return;
    if (new Date(entry.published_at).getTime() < chelseaWatchCutoff) return;
    const watchType = classifyChelseaWatch(entry.text);
    if (!watchType) return;
    if (!allowsChelseaWatchSource(source.key, watchType)) return;
    const id = makeId(entry.url);
    if (chelseaWatchKnownIds.has(id) || chelseaWatchIncoming.some((item) => item.id === id)) return;
    chelseaWatchIncoming.push({
      id,
      source_key: source.key,
      source_name: source.name,
      source_name_zh: source.name_zh || source.name,
      tier: source.tier,
      kind: entry.kind || 'tweet',
      text: entry.text,
      text_zh: null,
      url: entry.url,
      published_at: entry.published_at,
      badges: detectBadges(entry.text),
      watch_type: watchType,
      source_role_zh: source.watch_role_zh
        || (chelseaWatchGlobalKeys.has(source.key) ? '一线记者' : '曼城可靠线'),
    });
  };
  const chelseaReusableSources = sources.filter((source) => (
    chelseaWatchGlobalKeys.has(source.key) || chelseaWatchEnzoOnlyKeys.has(source.key)
  ));
  for (const source of [...chelseaReusableSources, ...chelseaWatchTimelineSources]) {
    for (const entry of rawBySource.get(source.key) || []) addChelseaWatchEntry(entry, source);
  }
  for (const entry of chelseaGnewsEntries) addChelseaWatchEntry(entry, entry.outlet);
  chelseaWatchIncoming.sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
  const chelseaWatchMerged = mergeItems(chelseaWatchKept, chelseaWatchIncoming);
  const chelseaWatchItems = prioritizeChelseaWatchItems(chelseaWatchMerged).slice(0, settings.chelsea_watch_max_items ?? 36);
  const camaraCount = chelseaWatchItems.filter((item) => item.watch_targets.includes('lamine_camara')).length;
  const koneCount = chelseaWatchItems.filter((item) => item.watch_targets.includes('manu_kone')).length;
  console.log(`[chelsea-watch] 保留 ${chelseaWatchItems.length} 条，卡马拉 ${camaraCount} 条，科内 ${koneCount} 条，本轮新增 ${chelseaWatchIncoming.length} 条`);

  const liverpoolSarrReusableSources = sources.filter((source) => liverpoolSarrGlobalKeys.has(source.key));
  const liverpoolSarrBatches = [...liverpoolSarrReusableSources, ...liverpoolSarrTimelineSources]
    .map((source) => ({ source, entries: rawBySource.get(source.key) || [] }));
  for (const entry of liverpoolSarrGnewsEntries) liverpoolSarrBatches.push({ source: entry.outlet, entries: [entry] });
  let liverpoolSarrItems = buildLiverpoolSarrWatchItems(prevLiverpoolSarrWatch?.items, liverpoolSarrBatches, liverpoolSarrAllowedKeys, {
    daysKeep: settings.liverpool_sarr_watch_days_keep ?? 7,
    maxItems: settings.liverpool_sarr_watch_max_items ?? 24,
  });

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
  const translation = await translateNew(merged, process.env.DEEPSEEK_API_KEY);
  console.log(
    `[translate] 本次翻译 ${translation.translated} 条` +
    `（备用通道 ${translation.fallbackTranslated} 条），剩余 ${translation.remaining} 条`,
  );
  if (translation.remaining > 0) {
    throw new Error(
      `翻译未完成：仍有 ${translation.remaining} 条消息缺少中文，停止发布以保留上一版`,
    );
  }

  // 与主流重复的恩佐消息直接复用译文，只翻雷达独有的切尔西引援消息。
  const mainTranslations = new Map(merged.filter((item) => item.text_zh).map((item) => [item.id, item.text_zh]));
  for (const item of chelseaWatchItems) {
    if (!item.text_zh && mainTranslations.has(item.id)) item.text_zh = mainTranslations.get(item.id);
  }
  const chelseaTranslation = await translateNew(chelseaWatchItems, process.env.DEEPSEEK_API_KEY);
  console.log(
    `[chelsea-translate] 本次翻译 ${chelseaTranslation.translated} 条` +
    `（备用通道 ${chelseaTranslation.fallbackTranslated} 条），剩余 ${chelseaTranslation.remaining} 条`,
  );
  if (chelseaTranslation.remaining > 0) {
    throw new Error(`蓝桥引援雷达翻译未完成：仍有 ${chelseaTranslation.remaining} 条，停止发布以保留上一版`);
  }

  for (const item of liverpoolSarrItems) {
    if (!item.text_zh && mainTranslations.has(item.id)) item.text_zh = mainTranslations.get(item.id);
  }
  // 新雷达翻译失败时只延后未译条目，不能阻塞普通曼城消息的更新和发布。
  try {
    const result = await translateNew(liverpoolSarrItems, process.env.DEEPSEEK_API_KEY, { signal: AbortSignal.timeout(45000) });
    console.log(`[sarr-translate] 翻译 ${result.translated} 条，暂缓 ${result.remaining} 条`);
  } catch (error) {
    console.warn(`[sarr-translate] ${error.message}`);
  }
  liverpoolSarrItems = liverpoolSarrItems.filter((item) => item.text_zh);
  console.log(`[liverpool-sarr-watch] 保留 ${liverpoolSarrItems.length} 条`);

  // ---------- 输出 ----------
  // 焦点标记全量重算（翻译后的中文别名也能命中）
  merged.forEach(tagFocus);
  merged.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  const finalItems = merged.slice(0, settings.max_items ?? 2000);
  statusList.sort((a, b) => (a.tier > b.tier ? 1 : a.tier < b.tier ? -1 : a.key.localeCompare(b.key)));

  await mkdir(DATA_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const metadata = {
    generated_at: generatedAt,
    twitter_enabled: Boolean(rsshubUrl),
    focus_targets: focusTargets.map(({ key, name, name_zh, desc_zh }) => ({ key, name, name_zh, desc_zh })),
    sources: sources.map(({ key, name, name_zh, tier, type }) => ({ key, name, name_zh, tier, type })),
  };
  const paged = buildPagedData(finalItems, metadata, {
    latestCount: settings.initial_items,
    focusCount: settings.initial_focus_items,
    archiveSize: settings.archive_chunk_size,
  });
  await writeFile(resolve(DATA_DIR, 'items.json'), JSON.stringify({ ...metadata, items: finalItems }));
  await writeFile(resolve(DATA_DIR, 'chelsea-watch.json'), JSON.stringify({
    generated_at: generatedAt,
    scope: 'chelsea_incoming_and_enzo_city',
    items: chelseaWatchItems,
  }));
  await writeFile(resolve(DATA_DIR, 'liverpool-sarr-watch.json'), JSON.stringify({
    generated_at: generatedAt,
    scope: 'liverpool_incoming_ismaila_sarr',
    items: liverpoolSarrItems,
  }));
  await writeFile(resolve(DATA_DIR, 'items-latest.json'), JSON.stringify(paged.latest));
  for (const archive of paged.archives) {
    await writeFile(resolve(DATA_DIR, archive.file), JSON.stringify(archive.payload));
  }
  await writeFile(
    resolve(DATA_DIR, 'status.json'),
    JSON.stringify({ updated_at: generatedAt, sources: statusList }),
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
