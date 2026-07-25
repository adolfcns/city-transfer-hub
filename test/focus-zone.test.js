import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';

const config = YAML.parse(fs.readFileSync('config/sources.yaml', 'utf8'));
const app = fs.readFileSync('static/app.js', 'utf8');
const index = fs.readFileSync('static/index.html', 'utf8');

test('重点传闻配置同时包含布阿迪和维尼修斯', () => {
  const targets = new Map((config.focus_targets || []).map((target) => [target.key, target]));
  assert.equal(targets.get('bouaddi')?.name_zh, '布阿迪');
  assert.equal(targets.get('vinicius')?.name_zh, '维尼修斯');
  assert.ok(targets.get('vinicius')?.aliases.includes('Vinícius Júnior'));
});

test('重点传闻使用球员切换且顶部文案已更新', () => {
  assert.match(app, /focus-target-tabs/);
  assert.match(app, /featured/);
  assert.match(app, /📌 重点传闻/);
  assert.match(index, /好戏才刚开始，一起关注曼城的转会动态 💙/);
  assert.doesNotMatch(index, /重点绯闻/);
});
