import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('static/index.html', 'utf8');
const app = fs.readFileSync('static/app.js', 'utf8');
const style = fs.readFileSync('static/style.css', 'utf8');

test('BIG 6账本包含统一口径的支出、收入和净支出', () => {
  assert.match(html, /id="big6-spend-notice"/);
  assert.match(html, /给无知的人科普一下 BIG 6 净支出吧/);
  assert.match(html, /支出、收入与净支出对比/);
  for (const team of ['利物浦', '热刺', '阿森纳', '曼城', '曼联', '切尔西']) assert.match(html, new RegExp(team));
  for (const value of ['250.1', '219.4', '334.0', '176.0', '198.5', '136.6', '440.3', '314.9', '125.4', '163.0', '118.0', '342.4', '409.7', '-67.3']) {
    assert.match(html, new RegExp(value.replace('.', '\\.')));
  }
  assert.match(html, /Sky Sports 9月2日最终汇总/);
  assert.match(html, /含公开浮动条款，不计未披露费用/);
});

test('曼城净支出用括号展示马尔穆什买断入账后的情形', () => {
  assert.match(html, /125\.4 <small>（65\.4）<\/small>/);
  assert.match(html, /马尔穆什 £60m 买断义务/);
});

test('筛选栏提供紧凑入口并且每十二小时自动展示一次', () => {
  assert.match(app, /BIG6_SPEND_NOTICE_INTERVAL_MS = 12 \* 60 \* 60 \* 1000/);
  assert.match(app, /localStorage\.setItem\(BIG6_SPEND_NOTICE_KEY, String\(Date\.now\(\)\)\)/);
  assert.match(app, /big6Button\.onclick = showBig6SpendNotice/);
  assert.match(app, /scheduleBig6SpendNotice\(\);/);
  assert.match(style, /\.big6-spend-trigger/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.big6-spend-box/);
  assert.match(style, /\.loan-watch\.home \.big6-spend-trigger/);
});
