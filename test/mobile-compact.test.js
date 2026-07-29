import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('static/style.css', 'utf8');

test('手机端收藏和低频筛选控件保持紧凑', () => {
  assert.match(css, /\.fav-btn\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?line-height:\s*18px;/);
  assert.match(css, /#search\s*\{[\s\S]*?min-height:\s*30px;[\s\S]*?font-size:\s*12px;/);
  assert.match(css, /\.src-btn\s*\{[^}]*min-height:\s*30px;[^}]*font-size:\s*12px;/);
  assert.match(css, /\.filterbar \.seg button\s*\{[^}]*min-height:\s*30px;[^}]*font-size:\s*12px;/);
});
