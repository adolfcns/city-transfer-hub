import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('static/index.html', 'utf8');
const app = fs.readFileSync('static/app.js', 'utf8');
const css = fs.readFileSync('static/style.css', 'utf8');

test('首页同时突出赛后战术与蓝月在外两个入口', () => {
  assert.match(html, /class="loan-page-hero-link analysis" href="\.\/\?view=analysis"/);
  assert.match(html, /<h2>蓝月赛后分析<\/h2>/);
  assert.match(html, /class="loan-page-hero-link" href="\.\/\?view=loans"/);
  assert.match(html, /<h2>外租小将入口<\/h2>/);
  assert.match(css, /\.feature-hero-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
});

test('三个页面分别提供栏目引导并按页面每四小时展示一次', () => {
  assert.match(app, /FEATURE_GUIDE_INTERVAL_MS = 4 \* 60 \* 60 \* 1000/);
  assert.match(app, /FEATURE_GUIDE_STORAGE_PREFIX = 'cth_feature_guide_4h_v1'/);
  assert.match(app, /return `\$\{FEATURE_GUIDE_STORAGE_PREFIX\}_\$\{PAGE_VIEW\}`/);
  assert.match(app, /if \(PAGE_VIEW === 'analysis'\)[\s\S]*?items: \[destinations\.loans\]/);
  assert.match(app, /if \(PAGE_VIEW === 'loans'\)[\s\S]*?items: \[destinations\.analysis\]/);
  assert.match(app, /items: \[destinations\.analysis, destinations\.loans\]/);
  assert.match(app, /scheduleFeatureGuide\(\);/);
  assert.match(css, /\.feature-guide-box/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.feature-guide-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
});
