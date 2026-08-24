import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('static/app.js', 'utf8');
const index = fs.readFileSync('static/index.html', 'utf8');

test('转会窗倒计时使用官方关窗时间并精确到天时分秒', () => {
  assert.match(index, /尽管不如人意，我想再信一次💙/);
  assert.match(index, /最后一周，蓝月终局之战！/);
  assert.match(index, /是满载而归，还是遗憾收场？/);
  assert.match(app, /最后一周，蓝月终局之战。距离关窗还有/);
  assert.match(app, /2026-09-01T22:00:00Z/);
  assert.doesNotMatch(app, /2026-09-01T17:00:00Z/);
  for (const part of ['days', 'hours', 'minutes', 'seconds']) {
    assert.match(index, new RegExp(`data-countdown="${part}"`));
  }
  assert.match(app, /const minutes =/);
  assert.match(app, /const seconds =/);
  assert.match(app, /setInterval\(renderCountdown, 1000\)/);
  assert.doesNotMatch(app, /setInterval\(renderCountdown, 60e3\)/);
});
