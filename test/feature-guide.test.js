import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('static/index.html', 'utf8');
const app = fs.readFileSync('static/app.js', 'utf8');
const css = fs.readFileSync('static/style.css', 'utf8');

test('首页同时突出赛前、赛后、蓝月在外与国家队追踪四个入口', () => {
  assert.match(html, /class="loan-page-hero-link preview" href="\.\/\?view=preview"/);
  assert.match(html, /<h2>蓝月比赛前瞻<\/h2>/);
  assert.match(html, /class="loan-page-hero-link analysis" href="\.\/\?view=analysis"/);
  assert.match(html, /<h2>蓝月赛后分析<\/h2>/);
  assert.match(html, /class="loan-page-hero-link" href="\.\/\?view=loans"/);
  assert.match(html, /<h2>外租小将入口<\/h2>/);
  assert.match(html, /class="loan-page-hero-link internationals" href="\.\/\?view=internationals"/);
  assert.match(html, /<h2>国家队出征<\/h2>/);
  assert.match(css, /\.feature-hero-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
});

test('所有自动弹窗关闭，评论和投票仍可由用户主动打开', () => {
  const startup = app.slice(app.lastIndexOf('// ---------------- 启动 ----------------'));
  assert.doesNotMatch(startup, /scheduleFeatureGuide\(\)/);
  assert.doesNotMatch(startup, /scheduleWindowFinaleNotice\(\)/);
  assert.doesNotMatch(startup, /showRecoveryNotice\(\)/);
  assert.match(startup, /requestedSurveyId\(\)/);
  assert.match(app, /openComments/);
});
