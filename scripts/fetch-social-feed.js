// 曼城社媒首页：抓取转会窗时期使用的完整 X 信源池。
//
// 环境变量：
//   RSSHUB_URL             RSSHub 地址（X 时间线入口）
//   PREV_SOCIAL_FEED_URL   上一次 social-feed.json 的线上地址
//   PREV_SOCIAL_STATUS_URL 上一次 social-status.json 的线上地址
//   PREV_LEGACY_DATA_URL   首次上线时可从旧 items.json 继承这些信源的历史
//   DEEPSEEK_API_KEY       中文翻译密钥（失败时仍会尝试免费备用翻译）
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { initHttp, httpGet } from './lib/http.js';
import { fetchSource } from './lib/sources.js';
import { htmlToText } from './lib/rss.js';
import { makeMatchers, detectBadges, makeId, mergeItems } from './lib/pipeline.js';
import { translateNew } from './lib/translate.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DATA_DIR = resolve(ROOT, 'data');
const DAYS_KEEP = 10;
const MAX_ITEMS = 240;
const REQUEST_DELAY_MS = 2500;

// 这十个账号仍作为首页核心信源优先抓取；其余 X 信源从 sources.yaml 动态补入。
export const SOCIAL_SOURCE_KEYS = Object.freeze([
  'city_xtra',
  'bajkowski',
  'samlee',
  'gaughan',
  'fpl_maine_road',
  'etihad_intel',
  'mcfcous',
  'city_report',
  'tolmie',
  'city_chief',
]);

export const SOCIAL_SOURCE_LABELS = Object.freeze({
  city_xtra: 'City Xtra',
  bajkowski: 'Simon Bajkowski',
  samlee: 'Sam Lee',
  gaughan: 'Jack Gaughan',
  fpl_maine_road: 'FPL Maine Road',
  etihad_intel: 'Etihad Intel',
  mcfcous: 'mcfcous',
  city_report: 'City Report',
  tolmie: "Tolmie's Hairdoo",
  city_chief: 'City Chief',
});

const SOCIAL_DEDICATED_CITY_SOURCE_KEYS = new Set([
  'city_xtra',
  'fpl_maine_road',
  'etihad_intel',
  'mcfcous',
  'city_report',
  'tolmie',
  'city_chief',
]);

const SOCIAL_SOURCE_NOTES = Object.freeze({
  city_xtra: '曼城资讯聚合',
  fpl_maine_road: '曼城阵容与球队动态',
  etihad_intel: '曼城内幕与转会',
  mcfcous: '曼城专属消息源',
  city_report: '曼城资讯聚合',
  tolmie: '蓝月论坛爆料与暗示',
  city_chief: '曼城独立资讯聚合',
});

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

async function loadJson(urlEnv, localFile) {
  const url = process.env[urlEnv];
  if (url) {
    try {
      return JSON.parse(await httpGet(url, { retries: 0, timeout: 15000 }));
    } catch (error) {
      console.warn(`[social-prev] ${url} 暂不可用：${error.message}`);
    }
  }
  try {
    return JSON.parse(await readFile(resolve(DATA_DIR, localFile), 'utf8'));
  } catch {
    return null;
  }
}

export function selectSocialSources(config) {
  const sourceByKey = new Map((config.sources || []).map((source) => [source.key, source]));
  const core = SOCIAL_SOURCE_KEYS.map((key) => sourceByKey.get(key)).filter(Boolean);
  const coreKeys = new Set(core.map((source) => source.key));
  const additional = (config.sources || [])
    .filter((source) => source.type === 'twitter' && !coreKeys.has(source.key));
  return [...core, ...additional];
}

export function isCase115Post(text) {
  const value = htmlToText(text || '');
  if (/\b115\b/i.test(value)) return true;
  const isCityCase = /\b(?:manchester city|man city|mcfc|cityzens)\b/i.test(value);
  const hasCaseLanguage = /\b(?:charges?|allegations?|breaches?|independent commission|tribunal|verdict|ruling|appeal|sanctions?|punishment|points? deduction|relegation|expulsion|financial rules?|premier league case)\b/i.test(value);
  return isCityCase && hasCaseLanguage;
}

export function isSocialPost(source, text, matchers) {
  if (matchers.isExcluded(text)) return false;
  // 115 指控相关内容单独放行；曼城专号允许简短爆料和暗示。
  if (isCase115Post(text)) return true;
  // 除俱乐部名外也认现役球员和教练，避免“哈兰德状态更新”这类未写 MCFC 的帖子漏掉。
  return SOCIAL_DEDICATED_CITY_SOURCE_KEYS.has(source.key) || matchers.isCity(text) || matchers.isCurrentMan(text);
}

function normalizeItem(item, sourceByKey) {
  const source = sourceByKey.get(item.source_key);
  return {
    ...item,
    source_name_zh: SOCIAL_SOURCE_LABELS[item.source_key] || source?.name_zh || item.source_name_zh || item.source_name,
    note_zh: SOCIAL_SOURCE_NOTES[source?.key] || source?.note_zh || item.note_zh || '曼城消息源',
    text: htmlToText(item.text) || item.text,
  };
}

function latestSuccess(statusList, previousStatus) {
  const candidates = [
    ...(statusList || []).map((item) => item.last_success),
    ...((previousStatus?.sources || []).map((item) => item.last_success)),
  ].filter(Boolean).map(Date.parse).filter(Number.isFinite);
  return candidates.length ? new Date(Math.max(...candidates)).toISOString() : null;
}

export async function buildSocialFeed() {
  const startedAt = Date.now();
  await initHttp();

  const config = YAML.parse(await readFile(resolve(ROOT, 'config/sources.yaml'), 'utf8'));
  const sources = selectSocialSources(config);
  const foundCore = new Set(sources.map((source) => source.key));
  if (SOCIAL_SOURCE_KEYS.some((key) => !foundCore.has(key))) {
    throw new Error(`社媒核心信源配置不完整：缺少 ${SOCIAL_SOURCE_KEYS.filter((key) => !foundCore.has(key)).join(', ')}`);
  }

  const matchers = makeMatchers(config);
  const sourceByKey = new Map(sources.map((source) => [source.key, source]));
  const allowed = new Set(sources.map((source) => source.key));
  const cutoff = Date.now() - DAYS_KEEP * 86400e3;
  const previousSocial = await loadJson('PREV_SOCIAL_FEED_URL', 'social-feed.json');
  const legacy = previousSocial || await loadJson('PREV_LEGACY_DATA_URL', 'items.json');
  const previousStatus = await loadJson('PREV_SOCIAL_STATUS_URL', 'social-status.json');
  const previousStatusByKey = new Map((previousStatus?.sources || []).map((source) => [source.key, source]));

  const kept = (legacy?.items || [])
    .filter((item) => allowed.has(item.source_key))
    .filter((item) => Date.parse(item.published_at) >= cutoff)
    .map((item) => normalizeItem(item, sourceByKey))
    .filter((item) => item.url && item.text && !/^RT[ :@]/i.test(item.text))
    .filter((item) => isSocialPost(sourceByKey.get(item.source_key), item.text, matchers));
  const knownIds = new Set(kept.map((item) => item.id));
  const rsshubUrl = process.env.RSSHUB_URL || '';
  const context = {
    rsshubUrl,
    excludeRetweets: config.settings?.exclude_retweets !== false,
    excludeReplies: config.settings?.exclude_replies !== false,
  };
  const incoming = [];
  const statuses = [];

  for (const [index, source] of sources.entries()) {
    const prior = previousStatusByKey.get(source.key);
    if (!rsshubUrl) {
      statuses.push({
        key: source.key, name: source.name, name_zh: SOCIAL_SOURCE_LABELS[source.key] || source.name_zh || source.name, tier: source.tier,
        type: source.type, enabled: false, ok: false, items: 0, admitted: 0,
        last_success: prior?.last_success || null, error: 'TWITTER_AUTH_TOKEN 未启用',
      });
      continue;
    }

    try {
      const entries = await fetchSource(source, context) || [];
      const admittedBefore = incoming.length;
      for (const entry of entries) {
        if (!entry?.url || !entry?.text || Date.parse(entry.published_at) < cutoff) continue;
        if (!isSocialPost(source, entry.text, matchers)) continue;
        const id = makeId(entry.url);
        if (knownIds.has(id) || incoming.some((item) => item.id === id)) continue;
        incoming.push({
          id,
          source_key: source.key,
          source_name: source.name,
          source_name_zh: SOCIAL_SOURCE_LABELS[source.key] || source.name_zh || source.name,
          tier: source.tier,
          kind: 'tweet',
          text: entry.text,
          text_zh: null,
          url: entry.url,
          published_at: entry.published_at,
          badges: [...new Set([
            ...detectBadges(entry.text),
            ...(isCase115Post(entry.text) ? ['CASE_115'] : []),
          ])],
          note_zh: SOCIAL_SOURCE_NOTES[source.key] || source.note_zh || '曼城消息源',
        });
      }
      const admitted = incoming.length - admittedBefore;
      const empty = entries.length === 0;
      statuses.push({
        key: source.key, name: source.name, name_zh: SOCIAL_SOURCE_LABELS[source.key] || source.name_zh || source.name, tier: source.tier,
        type: source.type, enabled: true, ok: !empty, items: entries.length, admitted,
        last_success: empty ? prior?.last_success || null : new Date().toISOString(),
        error: empty ? '上游返回空时间线，已保留历史' : null,
      });
      console.log(`[social] ${source.key}: 抓 ${entries.length} / 新入 ${admitted}`);
    } catch (error) {
      statuses.push({
        key: source.key, name: source.name, name_zh: SOCIAL_SOURCE_LABELS[source.key] || source.name_zh || source.name, tier: source.tier,
        type: source.type, enabled: true, ok: false, items: 0, admitted: 0,
        last_success: prior?.last_success || null, error: String(error.message || error).slice(0, 200),
      });
      console.warn(`[social-fail] ${source.key}: ${error.message}`);
    }
    if (index < sources.length - 1) await wait(REQUEST_DELAY_MS);
  }

  incoming.sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at));
  const merged = mergeItems(kept, incoming)
    .filter((item) => allowed.has(item.source_key))
    .map((item) => normalizeItem(item, sourceByKey))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
    .slice(0, MAX_ITEMS);

  if (!merged.length) {
    // 首次上线遇到 X 短时失联时仍允许页面结构先发布；last_success 保持为空，
    // 小时任务会持续重试，前台同时明确显示“时间线暂未连接”。
    console.warn('[social] 暂无可发布内容，输出空数据并等待下一轮重试');
  }

  const translation = await translateNew(merged, process.env.DEEPSEEK_API_KEY);
  console.log(`[social-translate] 翻译 ${translation.translated} 条，剩余 ${translation.remaining} 条`);
  if (translation.remaining > 0) {
    throw new Error(`社媒中文翻译未完成：仍有 ${translation.remaining} 条，停止发布以保留上一版`);
  }

  const now = new Date().toISOString();
  const okCount = statuses.filter((status) => status.ok).length;
  const generatedAt = okCount > 0 ? now : (previousSocial?.generated_at || legacy?.generated_at || now);
  const sourceCatalog = sources.map((source) => ({
    key: source.key,
    name: source.name,
    name_zh: SOCIAL_SOURCE_LABELS[source.key] || source.name_zh || source.name,
    tier: source.tier,
    type: source.type,
  }));

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(resolve(DATA_DIR, 'social-feed.json'), JSON.stringify({
    generated_at: generatedAt,
    checked_at: now,
    twitter_enabled: Boolean(rsshubUrl),
    sources: sourceCatalog,
    items: merged,
  }));
  await writeFile(resolve(DATA_DIR, 'social-status.json'), JSON.stringify({
    updated_at: now,
    last_success: latestSuccess(statuses, previousStatus),
    sources: statuses,
  }));
  console.log(`[social-done] ${merged.length} 条 | 信源 ${okCount}/${sources.length} 正常 | ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) buildSocialFeed().catch((error) => {
  console.error(error);
  process.exit(1);
});
