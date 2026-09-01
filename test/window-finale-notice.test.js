import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('static/index.html', 'utf8');
const app = fs.readFileSync('static/app.js', 'utf8');
const style = fs.readFileSync('static/style.css', 'utf8');
const pagesWorker = fs.readFileSync('cloudflare/pages-worker.js', 'utf8');
const triggerWorker = fs.readFileSync('scripts/cloudflare-worker.js', 'utf8');
const routes = JSON.parse(fs.readFileSync('cloudflare/pages-routes.json', 'utf8'));

test('手机和电脑每台设备每五小时显示夏窗终章', () => {
  assert.match(html, /id="window-finale-notice"/);
  assert.match(html, /夏窗终章/);
  assert.match(html, /我们一起等到了最后/);
  assert.match(app, /WINDOW_FINALE_NOTICE_INTERVAL_MS = 5 \* 60 \* 60 \* 1000/);
  assert.match(app, /localStorage\.setItem\(WINDOW_FINALE_NOTICE_KEY, String\(Date\.now\(\)\)\)/);
  assert.match(app, /scheduleWindowFinaleNotice\(\);/);
  assert.match(style, /\.window-finale-notice/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.window-finale-box/);
});

test('终章突出四项统计、署名和最终按钮', () => {
  for (const value of ['54', '5,381', '1,103', '45']) assert.match(html, new RegExp(`>${value}<`));
  assert.match(html, /懂球帝 @秃然离城/);
  assert.match(html, /为了💙，不见不散/);
  assert.match(html, /曼城外租球员和今夏离队球员/);
  assert.match(style, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
});

test('关窗后终章自动切换为落幕文案', () => {
  assert.match(app, /Date\.now\(\) >= WINDOWS\[0\]\.ts/);
  assert.match(app, /答案已经写下，夏窗正式落幕/);
  assert.match(app, /夏窗已经落幕/);
});

test('终章展示投票、好运、表情和评论，分享仅保留后台统计', () => {
  for (const id of ['votes', 'prayers', 'reactions', 'comments']) {
    assert.match(html, new RegExp(`id="window-finale-${id}"`));
  }
  assert.doesNotMatch(html, /id="window-finale-shares"/);
  assert.doesNotMatch(html, /同一球迷参加不同问卷/);
  assert.match(app, /WINDOW_FINALE_STATS_ENDPOINTS/);
  assert.match(app, /loadWindowFinaleInteractionStats\(\)/);
  assert.match(style, /\.window-finale-interaction-grid/);
  for (const worker of [pagesWorker, triggerWorker]) {
    assert.match(worker, /function readFinaleStats\(env\)/);
    assert.match(worker, /SELECT COUNT\(\*\) AS n FROM survey_ballots/);
    assert.match(worker, /event_type IN \('native_share','copy_link','save_image'\)/);
    assert.match(worker, /finale-stats/);
  }
  assert.ok(routes.include.includes('/finale-stats'));
});
