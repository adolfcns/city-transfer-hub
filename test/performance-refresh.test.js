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
