import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  calculateAge,
  flattenPlayerStats,
  isTrackedAppearance,
  lineupAppearanceStatus,
  matchFromDetails,
  selectPositionMetrics,
  summarizeMatches,
} from '../scripts/fetch-loan-watch.js';

const config = JSON.parse(fs.readFileSync('config/loan-watch-players.json', 'utf8'));
const app = fs.readFileSync('static/app.js', 'utf8');
const style = fs.readFileSync('static/style.css', 'utf8');
const workflow = fs.readFileSync('.github/workflows/fetch.yml', 'utf8');

test('用户点名的十二名球员严格置顶，其余球员随后排列', () => {
  assert.equal(config.players.length, 21);
  assert.deepEqual(config.players.slice(0, 12).map((player) => player.name_zh), [
    '朱马·巴',
    '马克斯·阿莱恩',
    '斯蒂芬·姆富尼',
    '查理·格雷',
    '贾登·赫斯基',
    '斯韦雷·尼潘',
    '迪万·穆卡萨',
    '马蒂斯·德图尔贝',
    '迪万·穆巴马',
    '杰里米·蒙加',
    '卡万·沙利文',
    '克劳迪奥·埃切维里',
  ]);
  assert.ok(config.players.slice(0, 12).every((player) => player.priority === true));
  assert.ok(config.players.slice(12).every((player) => player.priority === false));
  assert.equal(config.players.find((player) => player.key === 'jeremy_monga')?.club_zh, '斯旺西');
  assert.equal(config.players.find((player) => player.key === 'cavan_sullivan')?.status, 'future_city');
});

test('球迷点将与曼城外租名单分栏，首位关注菲利克斯恩梅加', () => {
  assert.equal(config.fan_picks.length, 1);
  const pick = config.fan_picks[0];
  assert.equal(pick.key, 'felix_nmecha');
  assert.equal(pick.fotmob_id, 966019);
  assert.equal(pick.fotmob_team_id, 9789);
  assert.equal(pick.status, 'fan_pick');
  assert.equal(pick.fan_pick, true);
  assert.equal(pick.relation_zh, '曼城青训旧将');
  assert.match(app, /\{ key: 'fan_pick', label: '球迷点将' \}/);
  assert.match(app, /activeFilter === 'fan_pick' && player\.fan_pick/);
  assert.match(app, /const loanPlayers = data\.players\.filter\(\(player\) => !player\.fan_pick\)/);
  assert.match(app, /player\.fan_pick \? '本赛季比赛记录' : '本赛季租借后比赛记录'/);
  assert.match(style, /\.loan-watch-filter\.fan-pick/);
});

test('球员简介含年龄、去向、位置并按比赛位置分类', () => {
  for (const player of [...config.players, ...config.fan_picks]) {
    assert.ok(player.fotmob_id, `${player.name_zh} 缺少数据源 ID`);
    assert.ok(player.fotmob_team_id, `${player.name_zh} 缺少赛程球队 ID`);
    assert.ok(player.birth_date, `${player.name_zh} 缺少出生日期`);
    assert.ok(player.club_zh && player.club_en, `${player.name_zh} 缺少去向`);
    assert.ok(player.position_zh, `${player.name_zh} 缺少位置`);
    assert.ok(['keeper', 'defender', 'midfielder', 'attacker'].includes(player.position_group));
    assert.ok(Array.isArray(player.team_names) && player.team_names.length > 0);
  }
  assert.equal(calculateAge('2009-09-28T00:00:00.000Z', new Date('2026-09-02T00:00:00Z')), 16);
  assert.equal(calculateAge('2005-07-21T00:00:00.000Z', new Date('2026-09-02T00:00:00Z')), 21);
  assert.match(app, /\$\{player\.name_en\} · \$\{player\.age \?\? '—'\}岁 · \$\{player\.position_zh\}/);
  assert.match(app, /\$\{player\.club_zh\} · \$\{player\.club_en\}/);
});

test('只接纳本赛季租借生效后且属于当前去向球队的实际出场', () => {
  const player = config.players.find((item) => item.key === 'jeremy_monga');
  const valid = {
    teamName: 'Swansea City',
    playedInMatch: true,
    minutesPlayed: 31,
    matchDate: { utcTime: '2026-09-02T15:00:00.000Z' },
  };
  assert.equal(isTrackedAppearance(valid, player, config.season_start, new Date('2026-09-03T00:00:00Z')), true);
  assert.equal(isTrackedAppearance({ ...valid, teamName: 'Manchester City' }, player, config.season_start, new Date('2026-09-03T00:00:00Z')), false);
  assert.equal(isTrackedAppearance({ ...valid, playedInMatch: false, minutesPlayed: 0 }, player, config.season_start, new Date('2026-09-03T00:00:00Z')), false);
  assert.equal(isTrackedAppearance({ ...valid, matchDate: { utcTime: '2026-05-01T15:00:00.000Z' } }, player, config.season_start, new Date('2026-09-03T00:00:00Z')), false);
});

test('按位置提取赛后关键指标并累计本赛季历史比赛', () => {
  const flattened = flattenPlayerStats({
    stats: [{
      stats: {
        passes: { key: 'accurate_passes', stat: { value: 37, total: 42, type: 'fractionWithPercentage' } },
        chances: { key: 'chances_created', stat: { value: 3, type: 'integer' } },
        recoveries: { key: 'recoveries', stat: { value: 6, type: 'integer' } },
        tackles: { key: 'matchstats.headers.tackles', stat: { value: 2, type: 'integer' } },
      },
    }],
  });
  assert.equal(flattened.tackles.value, 2);
  assert.deepEqual(selectPositionMetrics(flattened, 'midfielder', 4), [
    { key: 'chances_created', label: '创造机会', value: '3' },
    { key: 'accurate_passes', label: '传球', value: '37/42' },
    { key: 'recoveries', label: '夺回球权', value: '6' },
    { key: 'tackles', label: '抢断', value: '2' },
  ]);
  const advanced = flattenPlayerStats({
    stats: [{
      stats: {
        xg: { key: 'expected_goals', stat: { value: 0.42, type: 'decimal' } },
        xa: { key: 'expected_assists', stat: { value: 0.18, type: 'decimal' } },
        shots: { key: 'total_shots', stat: { value: 4, type: 'integer' } },
        shotsOnTarget: { key: 'ShotsOnTarget', stat: { value: 2, type: 'integer' } },
        actions: { key: 'defensive_actions', stat: { value: 11, type: 'integer' } },
        recoveries: { key: 'recoveries', stat: { value: 7, type: 'integer' } },
        tackles: { key: 'tackles', stat: { value: 3, type: 'integer' } },
        interceptions: { key: 'interceptions', stat: { value: 2, type: 'integer' } },
        saves: { key: 'saves', stat: { value: 5, type: 'integer' } },
        prevented: { key: 'goals_prevented', stat: { value: 1.24, type: 'decimal' } },
        xgot: { key: 'expected_goals_on_target_faced', stat: { value: 2.24, type: 'decimal' } },
        boxSaves: { key: 'saves_inside_box', stat: { value: 4, type: 'integer' } },
      },
    }],
  });
  assert.deepEqual(selectPositionMetrics(advanced, 'attacker', 4).map((metric) => metric.label), ['预期进球', '预期助攻', '射门', '射正']);
  assert.deepEqual(selectPositionMetrics(advanced, 'defender', 4).map((metric) => metric.label), ['防守贡献', '夺回球权', '抢断', '拦截']);
  assert.deepEqual(selectPositionMetrics(advanced, 'keeper', 4).map((metric) => metric.label), ['扑救', '阻止失球', '预期失球', '禁区内扑救']);
  assert.deepEqual(summarizeMatches([
    { minutes: 90, goals: 1, assists: 0, rating: 7.5 },
    { minutes: 30, goals: 0, assists: 1, rating: 6.5 },
  ]), { appearances: 2, minutes: 120, goals: 1, assists: 1, average_rating: 7 });
});

test('按赛程驱动赛后抓取并设置每日安全额度', () => {
  assert.equal(config.schedule_refresh_hours, 24);
  assert.equal(config.estimated_match_duration_hours, 2);
  assert.equal(config.post_match_fetch_delay_hours, 1);
  assert.equal(config.provider_daily_limit, 95);
  assert.match(workflow, /export PREV_LOAN_WATCH_URL/);
  assert.match(workflow, /node scripts\/fetch-loan-watch\.js/);
  assert.doesNotMatch(workflow, /node scripts\/fetch\.js/);
  assert.match(workflow, /cron: '29 \* \* \* \*'/);
  assert.match(app, /只统计本赛季租借生效后的比赛。/);
  assert.match(app, /预计完赛 1 小时后抓取/);
  assert.match(app, /接下来谁出场？赛程表/);
  assert.match(app, /upcomingSchedule\.open = true/);
  assert.doesNotMatch(app, /context\.home && !window\.matchMedia\('\(max-width: 560px\)'\)\.matches/);
  assert.match(style, /\.loan-player-list \{[^}]*grid-template-columns: repeat\(2/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.loan-player-list \{ grid-template-columns: 1fr/);
});

test('球员卡片按中场、前锋、后卫、门将排列', () => {
  assert.match(app, /const LOAN_WATCH_POSITION_ORDER = Object\.freeze\(\{[\s\S]*?midfielder: 0,[\s\S]*?attacker: 1,[\s\S]*?defender: 2,[\s\S]*?keeper: 3/);
  assert.match(app, /const filteredPlayers = sortLoanWatchPlayers\(data\.players\.filter/);
});

test('蓝月在外先显示本机快照并在后台静默更新', () => {
  assert.match(app, /const LOAN_WATCH_CACHE_KEY = 'cth_loan_watch_cache_v1'/);
  assert.match(app, /const visibleData = context\.data\.loanWatch \|\| readLoanWatchCache\(\)/);
  assert.match(app, /if \(visibleData && !alreadyRendered\)/);
  assert.match(app, /if \(!visibleData \|\| loanWatch\.generated_at !== visibleData\.generated_at\) renderLoanWatch\(context\)/);
});

test('手机版球场图并入顶部背景且冬窗倒计时压缩为单行', () => {
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.topbar \{[\s\S]*?url\("assets\/etihad-night-hero\.webp"\)/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.stadium-hero::before \{[\s\S]*?display: none/);
  assert.match(style, /\.winter-window-kicker, \.winter-window-copy span \{ display: none; \}/);
  assert.match(style, /\.winter-window-card \{[\s\S]*?min-height: 32px;[\s\S]*?display: flex/);
  assert.match(style, /\.loan-watch\.home \.loan-match-emotion-key \{[\s\S]*?grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
});

test('所有窄屏手机把留言移到标题右侧并用横向表情说明替换概览数字', () => {
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.loan-watch\.home \.loan-watch-intro \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(160px, 1\.05fr\)/);
  assert.match(style, /\.loan-watch\.home \.loan-match-emotion-key \{[\s\S]*?grid-column: 1 \/ -1/);
  assert.doesNotMatch(app, /const overview = el\('div', 'loan-watch-overview'\)/);
  assert.match(style, /\.loan-request-board \{ min-width: 0; padding: 6px/);
  assert.match(style, /\.loan-match-reaction-bar\.reaction-bar\.compact \.reaction-btn \{ min-height: 21px/);
  assert.match(style, /\.loan-watch\.home \.loan-watch-filter \{ min-height: 25px/);
});

test('同一场比赛只请求一次并更新所有相关球员', () => {
  const fetcher = fs.readFileSync('scripts/fetch-loan-watch.js', 'utf8');
  assert.match(fetcher, /const dueMatches = new Map\(\)/);
  assert.match(fetcher, /dueMatches\.get\(fixture\.id\)\.push\(\{ player, fixture \}\)/);
  assert.match(fetcher, /fetchFotmob\(`matchDetails\?matchId=\$\{encodeURIComponent\(matchId\)\}`/);
  assert.match(fetcher, /for \(const \{ player, fixture \} of entries\)/);
});

test('赛后阵容区分首发、替补登场、替补未登场和未进名单', () => {
  const player = { fotmob_id: 9, fotmob_team_id: 100 };
  const details = {
    content: {
      lineup: {
        homeTeam: {
          id: 100,
          starters: [{ id: 9 }],
          subs: [{ id: 10, performance: { substitutionEvents: [{ type: 'subIn' }] } }, { id: 11 }],
        },
        awayTeam: { id: 200, starters: [], subs: [] },
      },
      playerStats: {},
    },
  };
  assert.equal(lineupAppearanceStatus(details, player), 'starter');
  details.content.lineup.homeTeam.starters = [];
  player.fotmob_id = 10;
  assert.equal(lineupAppearanceStatus(details, player), 'subbed_on');
  player.fotmob_id = 11;
  assert.equal(lineupAppearanceStatus(details, player), 'unused_sub');
  player.fotmob_id = 12;
  assert.equal(lineupAppearanceStatus(details, player), 'not_in_squad');
  assert.match(app, /starter: \{ label: '首发'/);
  assert.match(app, /subbed_on: \{ label: '替补登场'/);
  assert.match(app, /unused_sub: \{ label: '替补未登场'/);
  assert.match(app, /not_in_squad: \{ label: '未进名单'/);
  assert.match(style, /\.loan-appearance-status\.unused-sub/);
});

test('未出场球员没有 playerStats 时仍写入比赛记录并可自动补抓旧漏项', () => {
  const player = { fotmob_id: 9, fotmob_team_id: 100, club_en: 'Test City', position_group: 'midfielder' };
  const details = {
    general: { matchTimeUTCDate: '2026-09-03T19:00:00Z', leagueName: 'League' },
    header: { teams: [{ id: 100, name: 'Test City', score: 1 }, { id: 200, name: 'Visitors', score: 0 }] },
    content: {
      lineup: {
        homeTeam: { id: 100, starters: [], subs: [{ id: 9 }] },
        awayTeam: { id: 200, starters: [], subs: [] },
      },
      playerStats: {},
    },
  };
  const result = matchFromDetails(details, { id: 'fixture-1', date: '2026-09-03T19:00:00Z', url: 'https://example.com' }, player);
  assert.equal(result.appearance_status, 'unused_sub');
  assert.equal(result.is_home, true);
  assert.equal(result.opponent, 'Visitors');
  assert.equal(result.minutes, 0);
  const fetcher = fs.readFileSync('scripts/fetch-loan-watch.js', 'utf8');
  assert.match(fetcher, /fixture\.checked && !recordedIds\.has/);
  assert.match(fetcher, /fixture\.checked = false/);
  assert.ok((fetcher.match(/fotmob_team_id: configPlayer\.fotmob_team_id/g) || []).length >= 3);
});

test('赛程可点击定位球员卡片且逐场记录提供数据分析', () => {
  assert.match(app, /function loanWatchPlayerAnchorId\(key\)/);
  assert.match(app, /card\.id = loanWatchPlayerAnchorId\(player\.key\)/);
  assert.match(app, /const row = el\('button', 'loan-schedule-row'\)/);
  assert.match(app, /row\.onclick = \(\) => focusLoanWatchPlayer\(player\.key\)/);
  assert.match(app, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  assert.match(app, /function loanMatchAnalysisText\(match, player\)/);
  assert.match(app, /赛后数据解读/);
  assert.match(app, /并非 Opta 官方数据/);
  assert.match(style, /\.loan-match-analysis/);
  assert.match(style, /\.loan-player-card\.schedule-target/);
});

test('球员卡片提供极简近五场走势和每周最佳榜单', () => {
  assert.match(app, /function loanPlayerFiveMatchTrend\(player\)/);
  assert.match(app, /slice\(0, 5\)/);
  assert.match(app, /状态回升/);
  assert.match(app, /表现稳定/);
  assert.match(app, /近期回落/);
  assert.match(app, /function weeklyLoanLeaders\(data, now = new Date\(\)\)/);
  assert.match(app, /本周最佳球员/);
  assert.match(app, /出场至少30分钟/);
  assert.match(style, /\.loan-five-match-trend \{\s*min-height: 56px;[^}]*padding: 9px 12px/);
  assert.match(style, /\.loan-five-match-label \{[^}]*font-size: 13\.5px;[^}]*font-weight: 950/);
  assert.match(style, /\.loan-five-match-bars \{ width: 92px; height: 32px;/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.loan-five-match-trend \{ min-height: 48px;[^}]*padding: 7px 9px;[^}]*\}[\s\S]*?\.loan-five-match-label \{ font-size: 11\.5px; \}/);
  assert.match(style, /\.loan-weekly-award/);
  assert.match(style, /\.loan-weekly-player small \{[^}]*background: #e2f4fb; color: #075985; font-size: 12\.5px; font-weight: 950/);
  assert.match(style, /\.loan-weekly-rule \{ color: #314d5e; font-size: 10px; font-weight: 850/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.loan-weekly-player i \{ display: none; \}/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.loan-weekly-player strong \{ display: block;[^}]*font-size: 8\.5px;[^}]*text-align: center; \}/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.loan-weekly-player small \{ display: block;[^}]*font-size: 8px;[^}]*text-align: center; \}/);
});

test('每场外租比赛提供五项球迷评价并在球员卡片汇总', () => {
  for (const label of ['夯爆了', '未来可期', '拉完了', '砸手里了', '再看几场']) {
    assert.match(app, new RegExp(label));
  }
  assert.match(app, /return \{ id: `loanmatch_\$\{player\.key\}_\$\{safeMatchId\}` \}/);
  assert.match(app, /buildReactionBar\(reactionItem, true, 'loan-match'\)/);
  assert.match(app, /function loanPlayerReactionTotals\(player\)/);
  assert.match(app, /syncLoanPlayerReactionSummaries\(id\)/);
  assert.match(app, /function loanMatchReactionLegend\(\)/);
  assert.match(app, /球迷表情/);
  assert.match(app, /player\.fan_pick \? '本赛季比赛记录' : '本赛季租借后比赛记录'/);
  assert.match(style, /\.loan-match-history-body \{/);
  assert.match(style, /\.loan-match-row \{[^}]*border-left: 4px solid/);
  assert.match(style, /\.loan-player-reaction-totals \{[^}]*grid-template-columns: repeat\(5/);
  assert.match(style, /\.loan-match-reaction-bar\.reaction-bar\.compact \.reaction-btn \{[\s\S]*?flex-direction: row/);
});

test('球员卡片突出中文指标并弱化数字和表情', () => {
  assert.match(app, /item\.classList\.add\('is-zero'\)/);
  assert.match(style, /\.loan-summary-stat strong \{[^}]*grid-row: 2;[^}]*font-size: 10px/);
  assert.match(style, /\.loan-summary-stat small \{[^}]*grid-row: 1;[^}]*font-size: 11px;[^}]*font-weight: 950/);
  assert.match(style, /\.loan-match-stats \.loan-summary-stat small \{ font-size: 10\.5px/);
  assert.match(style, /\.loan-match-reaction-bar\.reaction-bar\.compact \.reaction-emoji \{ font-size: 10px/);
  assert.match(style, /\.loan-player-reaction-total i \{ font-size: 10px/);
  assert.match(style, /\.loan-match-history-label \{[^}]*font-size: 11px;[^}]*font-weight: 950/);
});

test('首页简介加入免注册球员提名榜并按赞成人数排序', () => {
  const pagesWorker = fs.readFileSync('cloudflare/pages-worker.js', 'utf8');
  const triggerWorker = fs.readFileSync('scripts/cloudflare-worker.js', 'utf8');
  assert.doesNotMatch(app, /首页不直接请求第三方，赛后数据由后台统一更新/);
  assert.match(app, /还想关注谁？请留言/);
  assert.match(app, /无需注册 · 大家都能看到/);
  assert.match(app, /LOAN_REQUEST_ITEM_ID = 'loan_watch_requests_2026'/);
  assert.match(app, /Number\(b\.like_count \|\| 0\) - Number\(a\.like_count \|\| 0\)/);
  assert.match(app, /action: 'like', comment_id: commentId/);
  assert.match(app, /已赞成，提名榜重新排序/);
  assert.match(style, /\.loan-request-board/);
  assert.match(style, /\.loan-request-support\.selected/);
  for (const worker of [pagesWorker, triggerWorker]) {
    assert.match(worker, /CREATE TABLE IF NOT EXISTS comment_likes/);
    assert.match(worker, /if \(body\.action === 'like'\)/);
  }
});
