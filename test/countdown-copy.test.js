import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('static/app.js', 'utf8');
const index = fs.readFileSync('static/index.html', 'utf8');

test('顶部改为冬窗开启倒计时', () => {
  assert.match(index, /距离冬窗开启，还有/);
  assert.match(index, /WINTER WINDOW · 2027/);
  assert.match(index, /id="winter-window-countdown"/);
  assert.match(app, /WINTER_WINDOW_OPENS_AT = Date\.parse\('2027-01-01T00:00:00Z'\)/);
  assert.match(app, /function updateWinterWindowCountdown\(\)/);
  assert.match(app, /setInterval\(updateWinterWindowCountdown, 1000\)/);
  assert.doesNotMatch(index, /距离维圣变成维处，只剩|尘埃落定。/);
});
