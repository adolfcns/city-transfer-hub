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
  assert.match(app, /introHeadline: '恭喜维亚纳带领曼城获得26\/27赛季销售冠军！'/);
  assert.match(app, /introEmphasis: '销售'/);
  assert.match(app, /introQuestion: '泥城究竟该何去何从？'/);
  assert.match(style, /\.survey-intro-headline \{[^}]*white-space: pre-line/);
  assert.match(style, /\.survey-intro-emphasis \{[^}]*font-size: 1\.75em/);
  assert.match(app, /el\('span', 'survey-intro-emphasis', emphasis\)/);
  assert.match(app, /会压哨补强，还是就这样结束？/);
  assert.doesNotMatch(app, /花30秒投出你的判断，看看蓝月球迷现在站哪边。/);
  assert.match(app, /primaryLabel: '花30秒给夏窗打分'/);
  assert.match(app, /已有 \$\{total\} 位蓝月球迷参与，看看你是不是少数派/);
  assert.match(app, /投票结果有变化，回来看看风向/);
  assert.match(app, /窗口还剩 XX 天，最亟需补强哪个位置/);
  assert.doesNotMatch(app, /维亚纳封神/);
  assert.doesNotMatch(app, /耽误您 1 分钟|再耽误您 1 分钟/);
  assert.doesNotMatch(app, /只能再签一个人/);
  assert.doesNotMatch(app, /精神状态/);
  const positionsBlock = app.match(/id: 'positions'[\s\S]*?id: 'arrivals'/)?.[0] || '';
  assert.doesNotMatch(positionsBlock, /门将/);
});

test('重点传闻入口按确认顺序排列并提供蓝月在外预约', () => {
  assert.match(app, /⚖️ 首秀评分/);
  assert.match(app, /📊 夏窗调查/);
  assert.match(app, /💬 本站体验/);
  assert.match(app, /🌍 蓝月在外/);
  assert.match(app, /const FOCUS_SURVEY_ORDER = Object\.freeze\(\[\s*'allan_scouting_report_2026',\s*'summer_2026',\s*'coach_debut_2026',\s*'loan_watch_preview_2026',\s*'site_experience_2026'/);
  assert.match(app, /for \(const pollId of FOCUS_SURVEY_ORDER\)/);
  assert.doesNotMatch(app, /entry: '⚽ 中场投票'/);
  assert.match(app, /focus-switchers/);
  assert.match(style, /\.focus-survey-entries/);
  assert.match(style, /\.survey-entry[\s\S]*?color: var\(--text\); font-size: 14px; font-weight: 800/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*\.focus-switchers/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.survey-entry \{[^}]*font-size: 13px; font-weight: 800/);
});

test('阿兰球探报告提供四张按需加载图表、固定入口和每日一次引流', () => {
  assert.match(app, /entry: '🔍 阿兰球探报告'/);
  assert.match(app, /title: '阿兰球探报告'/);
  assert.match(app, /数据不炸裂，曼城为什么还想要他/);
  assert.match(app, /reportOnly: true/);
  assert.match(app, /function renderScoutReport\(context\)/);
  assert.match(app, /image\.loading = 'lazy'/);
  assert.match(app, /image\.decoding = 'async'/);
  assert.match(app, /4 张图 · 约 1 分钟/);
  assert.match(app, /SCOUT_REPORT_INVITE_INTERVAL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(app, /SCOUT_REPORT_INVITE_DELAY_MS = 6500/);
  assert.match(app, /cth_allan_scout_report_20260822_daily_v1/);
  assert.match(app, /function scheduleScoutReportInvite/);
  assert.match(app, /document\.querySelector\('\.modal:not\(\[hidden\]\), \.comment-overlay, \.survey-overlay'\)[\s\S]*?scoutReportInviteHandled = true/);
  assert.match(app, /scheduleSurveyInvite\(\);\s*scheduleScoutReportInvite\(\);/);
  assert.match(style, /\.scout-report-sheet/);
  assert.match(style, /\.scout-intro-stats/);
  assert.match(style, /\.scout-report-toolbar/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.scout-report-figure/);
  for (const filename of ['01-overview.png', '02-dribbling.png', '03-output-gap.png', '04-role-map.png']) {
    assert.ok(fs.statSync(`static/assets/allan-report/${filename}`).size > 20_000, `${filename} 应为完整图表资源`);
  }
});

test('手机和电脑都会每四小时弹出夏窗调查', () => {
  assert.match(app, /cth_summer_20260822_4h_v1/);
  assert.match(app, /SURVEY_POPUP_ID = 'summer_2026'/);
  assert.match(app, /SURVEY_INVITE_INTERVAL_MS = 4 \* 60 \* 60 \* 1000/);
  assert.match(app, /title: '夏窗调查'/);
  assert.match(app, /恭喜维亚纳带领曼城获得26\/27赛季销售冠军！/);
  assert.match(app, /introQuestion: '泥城究竟该何去何从？'/);
  assert.match(app, /primaryLabel: '花30秒给夏窗打分'/);
  assert.doesNotMatch(app, /DESKTOP_SURVEY_MEDIA|matchMedia\(DESKTOP_SURVEY_MEDIA\)/);
  assert.match(app, /localStorage\.setItem\(SURVEY_INVITE_KEY, String\(Date\.now\(\)\)\)/);
  assert.match(app, /Date\.now\(\) - lastShownAt < SURVEY_INVITE_INTERVAL_MS/);
  assert.match(app, /document\.querySelector\('\.modal:not\(\[hidden\]\), \.comment-overlay, \.survey-overlay'\)/);
  assert.match(app, /openSurvey\(SURVEY_POPUP_ID\)/);
  assert.match(app, /scheduleSurveyInvite\(\);/);
  assert.match(app, /if \(definition\.announcementOnly\) \{[\s\S]*?renderSurveyIntro\(context\);[\s\S]*?if \(!definition\.reservationFeature\) return;/);
  assert.match(app, /if \(!definition\.entry\) continue;/);
  assert.match(style, /\.survey-preview-grid/);
  assert.match(style, /\.survey-intro-actions\.single/);
});

test('蓝月在外从 120 人开始全站预约且同设备只计一次', () => {
  assert.match(app, /reservationFeature: 'loan_watch_2026'/);
  assert.match(app, /reservationBase: 120/);
  assert.match(app, /primaryLabel: '预约关注'/);
  assert.match(app, /reservedLabel: '✓ 已预约'/);
  assert.match(app, /全站已有 \$\{count\.toLocaleString\('zh-CN'\)\} 人预约关注/);
  assert.match(app, /async function featureReservationApi/);
  assert.match(app, /city-transfer-hub\.pages\.dev\/reservations/);
  assert.match(style, /\.feature-reservation-status/);
  for (const worker of [pagesWorker, triggerWorker]) {
    assert.match(worker, /loan_watch_2026: \{ base: 120 \}/);
    assert.match(worker, /CREATE TABLE IF NOT EXISTS feature_reservations/);
    assert.match(worker, /PRIMARY KEY \(feature_id, voter_id\)/);
    assert.match(worker, /INSERT OR IGNORE INTO feature_reservations/);
    assert.match(worker, /count: Number\(rule\.base \|\| 0\) \+ Math\.max/);
    assert.match(worker, /\/reservations/);
  }
  assert.ok(routes.include.includes('/reservations'));
  assert.match(workflow, /reservations\?feature=loan_watch_2026/);
  assert.match(workflow, /reservations=ok/);
});

test('马嗨正赛首秀调查包含三题、投降式换人和漂亮统计图', () => {
  assert.match(app, /title: '社区盾赛后开庭'/);
  assert.match(app, /正赛首秀就投降，马嗨这份答卷配拿几分/);
  assert.match(app, /争议焦点：投降式换人 · 0 到 10 分，直接宣判/);
  assert.match(app, /id: 'score'[\s\S]*?id: 'attitude'[\s\S]*?id: 'blame'/);
  assert.match(app, /看完正赛首秀，你现在是什么态度/);
  assert.match(app, /这场最大的锅应该扣给谁/);
  assert.match(app, /id: 'blame'[\s\S]*?hint: '最多选择两个'[\s\S]*?type: 'multi', max: 2/);
  assert.match(app, /function renderCoachSurveyResults\(context\)/);
  assert.match(app, /function buildCoachSurveyShareCard\(context\)/);
  assert.match(app, /function downloadCoachSurveyResults\(context\)/);
  assert.match(app, /投降马嗨正赛首秀打分/);
  assert.match(app, /首秀不及格/);
  assert.doesNotMatch(app, /战术板建议直接回收/);
  assert.match(app, /0—10 分完整分布/);
  assert.match(app, /'去给夏窗打分'/);
  assert.doesNotMatch(app, /维亚纳的夏窗也该交卷/);
  assert.match(app, /openSurvey\('summer_2026'\)/);
  assert.match(app, /↓ 下载统计图/);
  assert.match(app, /三个问题的实时统计已经汇总/);
  assert.match(app, /问题一：0—10 分完整分布/);
  assert.match(app, /问题二：看完首秀，现在是什么态度/);
  assert.match(app, /问题三：这场最大的锅扣给谁/);
  assert.match(style, /\.coach-verdict-card/);
  assert.match(style, /\.coach-result-grid/);
  assert.match(style, /\.coach-next-poll/);
  for (const worker of [pagesWorker, triggerWorker]) {
    assert.match(worker, /coach_debut_2026:[\s\S]*?score: \{ type: 'number', min: 0, max: 10 \}/);
    assert.match(worker, /attitude: \{ type: 'single'[\s\S]*?blame: \{ type: 'multi', max: 2/);
    assert.match(worker, /Array\.isArray\(value\) \? value : \[value\]/);
  }
});

test('调查支持匿名修改、公开结果和云端持久化', () => {
  assert.match(app, /这网站下一步先改什么？你说了算/);
  assert.match(app, /加载速度、翻译、排版还是新功能？花 30 秒给站长指条路，票数最高的问题优先优化/);
  assert.match(app, /primaryLabel: '我要提意见'/);
  assert.match(app, /resultsLabel: '查看大家的选择'/);
  assert.match(app, /查看最新结果/);
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
  assert.match(workflow, /surveys\?poll=coach_debut_2026/);
  assert.match(workflow, /coachSurveyBody\.results\?\.questions\?\.attitude\?\.counts/);
  assert.match(workflow, /coachSurveyBody\.results\?\.questions\?\.blame\?\.counts/);
  assert.match(workflow, /surveys=ok/);
});

test('夏窗结果使用统计图并可分享截止当前日期的实时图片', () => {
  assert.match(app, /function buildSummerSurveyShareCard\(context\)/);
  assert.match(app, /await surveyApi\(context\.pollId\)/);
  assert.match(app, /统计截止 \$\{surveyShareDate\(new Date\(\)\)\}/);
  assert.match(app, /↗ 分享统计图/);
  assert.match(app, /summer-survey-overview/);
  assert.match(app, /survey-score-distribution/);
  assert.match(app, /title: '夏窗调查统计长图'/);
  assert.match(app, /downloadLabel: '↓ 保存长图'/);
  assert.match(app, /shareLabel: '↗ 分享链接'/);
  assert.match(app, /把这份蓝月风向分享给球迷朋友，喊他们也来投一票，看看你们是不是同一派/);
  assert.match(app, /url\.searchParams\.set\('survey', pollId\)/);
  assert.match(app, /const surveyId = requestedSurveyId\(\)/);
  assert.match(app, /openSurvey\(surveyId\)/);
  assert.match(app, /showShareCardSavePreview\(blob, filename/);
  assert.match(style, /\.summer-survey-overview/);
  assert.match(style, /\.survey-chart-grid/);
  assert.match(style, /\.share-save-share/);
  assert.match(style, /\.share-save-overlay \{[\s\S]*?z-index: 150/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*\.summer-survey-overview, \.survey-chart-grid/);
});
