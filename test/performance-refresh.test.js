import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('static/app.js', 'utf8');
const sources = fs.readFileSync('config/sources.yaml', 'utf8');

test('页面只保留最近十天的消息', () => {
  assert.match(sources, /days_keep:\s*10\b/);
});

test('刷新先检查小状态文件，版本未变时不重建消息流', () => {
  assert.match(app, /freshStatus = await fetchJSON\(STATUS_URL\)/);
  assert.match(app, /freshStatus\.updated_at === state\.status\.updated_at/);
  assert.match(app, /更新于 \$\{relTime\(state\.generatedAt\)\}/);
  assert.match(app, /状态检查失败时继续读取完整数据/);
});

test('首次只加载最新消息，滚动或搜索时再加载十天内历史包', () => {
  assert.match(sources, /initial_items:\s*100\b/);
  assert.match(sources, /archive_chunk_size:\s*100\b/);
  assert.match(app, /const DATA_URL = '\.\/data\/items-latest\.json'/);
  assert.match(app, /const DATA_FALLBACK_URL = '\.\/data\/items\.json'/);
  assert.match(app, /function appendArchiveControl\(\)/);
  assert.match(app, /if \(query && hasMoreArchives\(\)\) await loadAllArchives\(\)/);
});

test('分享链接只定位消息，不改变按发布时间排列的消息顺序', () => {
  assert.doesNotMatch(app, /feedItems\.unshift\(\.\.\.feedItems\.splice\(sharedIndex, 1\)\)/);
  assert.match(app, /appendNextFeedBatch\(sharedIndex\)/);
  assert.match(app, /cleanUrl\.searchParams\.delete\('msg'\)/);
  assert.match(app, /window\.history\.replaceState\(null, '', cleanUrl\.href\)/);
});

test('消息流顶部不再重复展示表情含义说明', () => {
  const html = fs.readFileSync('static/index.html', 'utf8');
  const css = fs.readFileSync('static/style.css', 'utf8');
  assert.doesNotMatch(html, /reaction-legend/);
  assert.doesNotMatch(css, /reaction-legend/);
});

test('重点传闻卡片关闭后消息回归普通流，互动计数仍按需请求', () => {
  assert.match(app, /const FOCUS_RUMOR_STRIP_ENABLED = false/);
  assert.match(app, /const pinnedIds = shouldShowPinnedStrip\(pinned\)[\s\S]*?: null/);
  assert.match(app, /filter\(\(it\) => !pinnedIds\?\.has\(itemId\(it\)\)\)/);
  assert.match(app, /夏窗收尾｜谁最让你意难平？/);
  assert.match(app, /function observeEngagement\(card, item\)/);
  assert.match(app, /engagementObserver = new IntersectionObserver/);
  assert.match(app, /queueReactionCounts\(\[item\]\)/);
  assert.match(app, /queueCommentCounts\(\[item\]\)/);
});

test('调查先显示静态内容，实时票数在后台同步', () => {
  assert.match(app, /renderSurveyIntro\(context\);\s*try \{\s*context\.data = await surveyApi\(pollId\)/);
  assert.match(app, /正在后台同步实时票数/);
  assert.doesNotMatch(app.slice(app.lastIndexOf('// ---------------- 启动 ----------------')), /scheduleSurveyInvite\(\)/);
});
