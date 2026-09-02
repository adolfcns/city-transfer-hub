import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  calculateAge,
  flattenPlayerStats,
  isTrackedAppearance,
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

test('球员简介含年龄、去向、位置并按比赛位置分类', () => {
  for (const player of config.players) {
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
    { key: 'accurate_passes', label: '传球', value: '37/42' },
    { key: 'chances_created', label: '创造机会', value: '3' },
    { key: 'recoveries', label: '夺回球权', value: '6' },
    { key: 'tackles', label: '抢断', value: '2' },
  ]);
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
  assert.match(app, /首页不直接请求第三方，赛后数据由后台统一更新/);
  assert.match(app, /预计完赛 1 小时后抓取/);
  assert.match(app, /接下来谁出场？赛程表/);
  assert.match(app, /context\.home && !window\.matchMedia\('\(max-width: 560px\)'\)\.matches/);
  assert.match(style, /\.loan-player-list \{[^}]*grid-template-columns: repeat\(2/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.loan-player-list \{ grid-template-columns: 1fr/);
});
