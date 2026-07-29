import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('static/app.js', 'utf8');
const index = fs.readFileSync('static/index.html', 'utf8');

test('转会窗倒计时精确到天时分秒并每秒刷新', () => {
  assert.match(index, /留给维亚纳的时间还有/);
  for (const part of ['days', 'hours', 'minutes', 'seconds']) {
    assert.match(index, new RegExp(`data-countdown="${part}"`));
  }
  assert.match(app, /const minutes =/);
  assert.match(app, /const seconds =/);
  assert.match(app, /setInterval\(renderCountdown, 1000\)/);
  assert.doesNotMatch(app, /setInterval\(renderCountdown, 60e3\)/);
});
