import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';
import { isLiverpoolSarrWatchItem, buildLiverpoolSarrWatchItems, LIVERPOOL_SARR_QUERY } from '../scripts/lib/liverpool-sarr-watch.js';
import { buildDomainMap, fetchTrustedTransferGnews } from '../scripts/lib/sources.js';
import { translateNew } from '../scripts/lib/translate.js';

test('萨尔追踪包含求购、报价、拒绝、无报价及留队等进展', () => {
  for (const text of [
    'Liverpool approach for Ismaïla Sarr rebuffed by Crystal Palace. No bid was made.',
    'Liverpool are interested in Ismaila Sarr.',
    'Crystal Palace Sarr transfer: Liverpool ready to make offer.',
    'Ismaila Sarr not for sale despite Liverpool interest.',
    'Ismaila Sarr will stay at Palace after Liverpool talks ended.',
    '利物浦求购水晶宫萨尔，报价被拒绝。',
  ]) assert.equal(isLiverpoolSarrWatchItem(text), true, text);
});

test('不收其他萨尔、比赛、旧闻、续约或普通利物浦引援', () => {
  for (const text of [
    'Liverpool target Pape Matar Sarr from Tottenham.',
    'Liverpool target Malang Sarr.',
    'Liverpool interested in Sarr.',
    'Ismaila Sarr scores against Liverpool for Crystal Palace.',
    'Crystal Palace injury update for Ismaila Sarr before Liverpool game.',
    'Liverpool bid for Alexander Isak.',
    'Ismaila Sarr joins Chelsea from Crystal Palace.',
    'On this day Liverpool agreed a transfer for Ismaila Sarr.',
    'Should Liverpool sign Ismaila Sarr?',
    'Liverpool Media Watch: Ismaila Sarr bid imminent.',
    'Ismaila Sarr signs new contract before Liverpool visit.',
    'Ismaila Sarr will leave Liverpool.',
  ]) assert.equal(isLiverpoolSarrWatchItem(text), false, text);
});

test('新旧萨尔数据都重新套用白名单与期限，去重、保持时间倒序及译文', () => {
  const now = Date.parse('2026-08-31T14:00:00Z');
  const source = { key: 'beat', name: 'Beat reporter', tier: 'T0' };
  const old = { id: 'kept', source_key: 'beat', text: 'Liverpool bid for Ismaila Sarr.', text_zh: '保留译文', url: 'https://example.com/kept', published_at: '2026-08-30T12:00:00Z' };
  const previous = [old, { ...old, id: 'unknown', source_key: 'blog' }, { ...old, id: 'expired', published_at: '2026-08-20T12:00:00Z' }];
  const before = structuredClone(previous);
  const entry = { text: 'Ismaila Sarr not for sale despite Liverpool interest.', url: 'https://example.com/latest', published_at: '2026-08-31T12:00:00Z' };
  const result = buildLiverpoolSarrWatchItems(previous, [
    { source, entries: [entry, entry, { ...entry, url: 'https://example.com/bad-date', published_at: 'invalid' }] },
    { source: { key: 'blog' }, entries: [entry] },
  ], new Set(['beat']), { now });
  assert.equal(result.length, 2);
  assert.equal(result[0].url, entry.url);
  assert.equal(result[1].text_zh, '保留译文');
  assert.deepEqual(previous, before);
  assert.equal(buildLiverpoolSarrWatchItems(previous, [], new Set(), { now }).length, 0);
});

test('萨尔新闻检索严格限制权威域名，不放行伪装子域名或无来源文章', async () => {
  const cfg = YAML.parse(fs.readFileSync('config/sources.yaml', 'utf8'));
  const sources = cfg.liverpool_sarr_watch_sources;
  assert.deepEqual(sources.filter((source) => source.type === 'twitter').map((source) => source.handle), ['JamesPearceLFC', '_pauljoyce', 'MattWoosie']);
  const map = buildDomainMap(sources.filter((source) => source.type !== 'twitter'));
  const xml = `<rss><channel>${[
    ['https://www.thetimes.co.uk', 'trusted'], ['https://www.bbc.com', 'bbc'],
    ['https://thetimes.co.uk.blog.example', 'spoof'], ['https://rumours.example', 'unknown'],
  ].map(([url, id]) => `<item><title>Liverpool target Ismaila Sarr - Outlet</title><link>https://example.com/${id}</link><pubDate>Mon, 31 Aug 2026 12:00:00 GMT</pubDate><source url="${url}">Outlet</source></item>`).join('')}</channel></rss>`;
  const entries = await fetchTrustedTransferGnews(map, LIVERPOOL_SARR_QUERY, async (url, options) => {
    assert.equal(new URL(url).searchParams.get('q'), LIVERPOOL_SARR_QUERY);
    assert.deepEqual(options, { timeout: 12000, retries: 0 });
    return xml;
  });
  assert.deepEqual(entries.map((entry) => entry.outlet.key), ['sarr_times', 'sarr_bbc']);
});

test('独立萨尔数据在主消息渲染后读取，翻译失败不会阻断主发布', () => {
  const fetchScript = fs.readFileSync('scripts/fetch.js', 'utf8');
  const app = fs.readFileSync('static/app.js', 'utf8');
  const workflow = fs.readFileSync('.github/workflows/fetch.yml', 'utf8');
  assert.match(fetchScript, /writeFile\(resolve\(DATA_DIR, 'liverpool-sarr-watch\.json'\)/);
  assert.match(fetchScript, /liverpoolSarrItems = liverpoolSarrItems\.filter\(\(item\) => item.text_zh\)/);
  assert.match(workflow, /PREV_LIVERPOOL_SARR_WATCH_URL/);
  assert.ok(app.indexOf('fetchJSON(LIVERPOOL_SARR_WATCH_URL)') > app.indexOf('buildSourceMenu();\n  render();'));
  assert.match(app, /renderChelseaWatchModule\(zone\);\s*renderLiverpoolSarrWatchModule\(zone\)/);
  assert.match(app, /liverpoolSarrWatchOpen = !state.liverpoolSarrWatchOpen/);
});

test('倒计时只换文案，保持原关窗时刻和小时分秒倒计时', () => {
  const app = fs.readFileSync('static/app.js', 'utf8');
  const html = fs.readFileSync('static/index.html', 'utf8');
  assert.match(html, /距离维圣变成维处，只剩/);
  assert.match(app, /距离维圣变成维处，只剩/);
  assert.match(app, /2026-09-01T22:00:00Z/);
});

test('雷达翻译可限时取消，未译条目留待下轮且不修改已有译文', async () => {
  const controller = new AbortController();
  controller.abort();
  const items = [{ text: 'Liverpool bid for Ismaila Sarr.', text_zh: null }, { text: 'old', text_zh: '已有译文' }];
  const result = await translateNew(items, '', { signal: controller.signal });
  assert.equal(result.remaining, 1);
  assert.equal(result.translated, 0);
  assert.equal(items[1].text_zh, '已有译文');
  assert.match(fs.readFileSync('scripts/fetch.js', 'utf8'), /AbortSignal.timeout\(45000\)/);
});
