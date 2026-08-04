import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('static/index.html', 'utf8');

test('好运按钮使用维亚纳买买买文案', () => {
  assert.match(index, /🥁 点一下，让维亚纳快点买买买/);
  assert.doesNotMatch(index, /点一下，送出你的蓝月好运/);
});
