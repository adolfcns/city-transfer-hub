import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';

const config = YAML.parse(fs.readFileSync('config/sources.yaml', 'utf8'));
const app = fs.readFileSync('static/app.js', 'utf8');
const index = fs.readFileSync('static/index.html', 'utf8');

test('重点传闻配置只保留布阿迪', () => {
  const targets = new Map((config.focus_targets || []).map((target) => [target.key, target]));
  assert.deepEqual([...targets.keys()], ['bouaddi']);
  assert.equal(targets.get('bouaddi')?.name_zh, '布阿迪');
  assert.equal(targets.has('vinicius'), false);
});

test('布阿迪重点传闻暂时撤下并换成签约横幅', () => {
  assert.match(app, /const FOCUS_RUMOR_STRIP_ENABLED = false/);
  assert.match(app, /销售冠军终于进货了！/);
  assert.match(app, /布阿迪入城！/);
  assert.match(app, /维圣的绝地反击，真要开始了？/);
  assert.match(app, /bouaddi-signing-banner/);
  assert.match(app, /featureRow\.appendChild\(surveyEntries\)/);
  assert.match(app, /FOCUS_RUMOR_STRIP_ENABLED[\s\S]*?&& items\.length > 0/);
  assert.doesNotMatch(app, /key === 'vinicius'/);
  assert.doesNotMatch(app, /el\('h2', 'focus-strip-title', '📌 重点传闻'\)/);
  assert.match(index, /尽管不如人意，我想再信一次💙/);
  assert.doesNotMatch(index, /重点绯闻/);
});
