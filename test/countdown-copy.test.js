import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('static/app.js', 'utf8');

test('转会窗倒计时使用维亚纳文案并保留天数和小时数', () => {
  assert.match(app, /留给维亚纳的时间仅剩 \$\{days\} 天/);
  assert.match(app, /留给维亚纳的时间仅剩 \$\{hours\} 小时！/);
  assert.doesNotMatch(app, /距\$\{w\.label\}还有/);
});
