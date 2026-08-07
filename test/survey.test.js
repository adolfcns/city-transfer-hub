import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('static/app.js', 'utf8');
const style = fs.readFileSync('static/style.css', 'utf8');
const pagesWorker = fs.readFileSync('cloudflare/pages-worker.js', 'utf8');
const triggerWorker = fs.readFileSync('scripts/cloudflare-worker.js', 'utf8');
const routes = JSON.parse(fs.readFileSync('cloudflare/pages-routes.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/fetch.yml', 'utf8');

test('夏窗调查使用确认后的问题和文案', () => {
  assert.match(app, /维圣封神/);
  assert.match(app, /我信维圣/);
  assert.match(app, /窗口还剩 XX 天，最亟需补强哪个位置/);
  assert.doesNotMatch(app, /维亚纳封神/);
  assert.doesNotMatch(app, /只能再签一个人/);
  assert.doesNotMatch(app, /精神状态/);
  const positionsBlock = app.match(/id: 'positions'[\s\S]*?id: 'arrivals'/)?.[0] || '';
  assert.doesNotMatch(positionsBlock, /门将/);
});

test('重点传闻旁提供两个紧凑调查入口', () => {
  assert.match(app, /📊 夏窗调查/);
  assert.match(app, /💬 本站体验/);
  assert.match(app, /focus-switchers/);
  assert.match(style, /\.focus-survey-entries/);
  assert.match(style, /\.survey-entry[\s\S]*?color: var\(--text\); font-size: 14px; font-weight: 800/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*\.focus-switchers/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.survey-entry \{[^}]*font-size: 13px; font-weight: 800/);
});

test('手机和电脑每天都会主动邀请一次夏窗调查', () => {
  assert.match(app, /cth_survey_invite_summer_2026_daily_v1/);
  assert.doesNotMatch(app, /DESKTOP_SURVEY_MEDIA|matchMedia\(DESKTOP_SURVEY_MEDIA\)/);
  assert.match(app, /function surveyInviteDay\(\)/);
  assert.match(app, /localStorage\.setItem\(SURVEY_INVITE_KEY, surveyInviteDay\(\)\)/);
  assert.match(app, /localStorage\.getItem\(SURVEY_INVITE_KEY\) === surveyInviteDay\(\)/);
  assert.match(app, /document\.querySelector\('\.modal:not\(\[hidden\]\), \.comment-overlay, \.survey-overlay'\)/);
  assert.match(app, /openSurvey\('summer_2026'\)/);
  assert.match(app, /scheduleDailySurveyInvite\(\);/);
});

test('调查支持匿名修改、公开结果和云端持久化', () => {
  assert.match(app, /查看实时结果/);
  assert.match(app, /修改我的答案/);
  assert.match(app, /cth_survey_profile_v1/);
  for (const worker of [pagesWorker, triggerWorker]) {
    assert.match(worker, /CREATE TABLE IF NOT EXISTS survey_ballots/);
    assert.match(worker, /CREATE TABLE IF NOT EXISTS survey_ip_claims/);
    assert.match(worker, /async function readSurveyResults[\s\S]*?await ensureSchema\(env\)/);
    assert.match(worker, /revision_count = survey_ballots\.revision_count \+ 1/);
    assert.match(worker, /survey_ip_salt_v1/);
    assert.match(worker, /path === '\/surveys'|url\.pathname === '\/surveys'/);
  }
  assert.ok(routes.include.includes('/surveys'));
  assert.match(workflow, /surveys\?poll=summer_2026/);
  assert.match(workflow, /surveys=ok/);
});
