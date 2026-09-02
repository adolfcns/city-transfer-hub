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

test('首页焦点区只保留夏窗评分和离队意难平两项投票', () => {
  const block = app.match(/function renderFocusZone\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(app, /const ACTIVE_SURVEY_IDS = new Set\(\['summer_2026', DEPARTURE_SURVEY_ID\]\)/);
  assert.match(block, /夏窗调查/);
  assert.match(block, /离队意难平/);
  assert.match(block, /openSurvey\('summer_2026'\)/);
  assert.match(block, /openSurvey\(DEPARTURE_SURVEY_ID\)/);
  assert.doesNotMatch(block, /renderChelseaWatchModule|renderSeasonBlessingModule|阿兰球探报告|英超首秀评分/);
  assert.match(index, /id="loan-watch-home"/);
  assert.doesNotMatch(index, /重点绯闻|冬窗见 💙/);
});
