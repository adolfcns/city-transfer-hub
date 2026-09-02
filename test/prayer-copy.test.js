import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('static/index.html', 'utf8');

test('右下角木鱼改为九月全胜小狗互动并保留全站计数', () => {
  const app = fs.readFileSync('static/app.js', 'utf8');
  const style = fs.readFileSync('static/style.css', 'utf8');
  assert.match(index, /为9月全胜，敲个木鱼/);
  assert.doesNotMatch(index, /咚一下，给蓝月攒满胜利好运/);
  assert.match(index, /assets\/city-dog-muyu\.png/);
  assert.doesNotMatch(index, /id="city-prayer"[^>]*hidden/);
  assert.match(app.slice(app.lastIndexOf('// ---------------- 启动 ----------------')), /bindPrayer\(\)/);
  assert.match(style, /\.prayer-mascot/);
  assert.ok(fs.statSync('static/assets/city-dog-muyu.png').size < 100_000);
});
