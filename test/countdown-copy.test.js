import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('static/app.js', 'utf8');
const index = fs.readFileSync('static/index.html', 'utf8');

test('转会窗倒计时使用官方关窗时间并以累计小时制造紧迫感', () => {
  assert.match(index, /尽管不如人意，我想再信一次💙/);
  assert.doesNotMatch(index, /关窗警报！蓝月最后冲刺！/);
  assert.match(index, /距离维圣变成维处，只剩/);
  assert.match(app, /`距离维圣变成维处，只剩 \$\{hours\}/);
  assert.doesNotMatch(app, /关窗警报，蓝月最后冲刺。/);
  assert.match(app, /2026-09-01T22:00:00Z/);
  assert.doesNotMatch(app, /2026-09-01T17:00:00Z/);
  assert.doesNotMatch(index, /data-countdown="days"/);
  assert.match(index, /data-countdown="hours">--<\/strong><small>小时<\/small>/);
  for (const part of ['hours', 'minutes', 'seconds']) {
    assert.match(index, new RegExp(`data-countdown="${part}"`));
  }
  assert.match(app, /const hours = Math\.floor\(totalMs \/ 3600e3\)/);
  assert.match(app, /const minutes =/);
  assert.match(app, /const seconds =/);
  assert.match(app, /setInterval\(renderCountdown, 1000\)/);
  assert.doesNotMatch(app, /setInterval\(renderCountdown, 60e3\)/);
});
