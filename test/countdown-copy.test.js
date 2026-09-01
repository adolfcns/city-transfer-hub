import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('static/app.js', 'utf8');
const index = fs.readFileSync('static/index.html', 'utf8');

test('夏窗关闭后改为冬窗见与新赛季祝福', () => {
  assert.match(index, /冬窗见 💙/);
  assert.match(index, /尘埃落定。/);
  assert.match(index, /愿新赛季所有球员远离伤病，也愿屏幕前的你一切顺利！/);
  assert.doesNotMatch(index, /距离维圣变成维处，只剩/);
  assert.match(app, /2026-09-01T22:00:00Z/);
  assert.doesNotMatch(app, /2026-09-01T17:00:00Z/);
  assert.doesNotMatch(index, /data-countdown=/);
  assert.doesNotMatch(app, /setInterval\(renderCountdown/);
});
