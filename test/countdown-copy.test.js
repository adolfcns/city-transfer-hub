import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('static/app.js', 'utf8');
const index = fs.readFileSync('static/index.html', 'utf8');

test('转会窗倒计时使用官方关窗时间并精确到天时分秒', () => {
  assert.match(index, /最后一周！/);
  assert.match(index, /距离维亚纳交卷只剩/);
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
