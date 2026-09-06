import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatchAnalysis, flattenTeamStats } from '../scripts/fetch-first-team-analysis.js';

const APP_SOURCE = readFileSync(new URL('../static/app.js', import.meta.url), 'utf8');

function fixtureDetails() {
  return {
    header: {
      teams: [
        { id: 8456, name: 'Manchester City', score: 1 },
        { id: 8669, name: 'Coventry City', score: 0 },
      ],
      status: { finished: true, utcTime: '2026-09-05T14:00:00Z' },
      events: {
        homeTeamGoals: {
          Haaland: [{ time: 26, fullName: 'Erling Haaland', assistInput: 'Antoine Semenyo', goalDescription: 'Header' }],
        },
        awayTeamGoals: {},
      },
    },
    content: {
      stats: {
        Periods: {
          All: {
            stats: [
              { key: 'top_stats', stats: [
                { key: 'BallPossesion', stats: [78, 22] },
                { key: 'expected_goals', stats: ['2.12', '1.37'] },
                { key: 'total_shots', stats: [15, 12] },
                { key: 'ShotsOnTarget', stats: [4, 3] },
                { key: 'big_chance', stats: [3, 3] },
                { key: 'touches_opp_box', stats: [36, 19] },
                { key: 'accurate_passes', stats: ['751 (92%)', '140 (64%)'] },
                { key: 'keeper_saves', stats: [3, 2] },
              ] },
            ],
          },
        },
      },
      playerStats: {
        737066: {
          role: 'Striker',
          stats: [{ stats: {
            xg: { key: 'expected_goals', stat: { value: 1.06 } },
            shots: { key: 'total_shots', stat: { value: 4 } },
          } }],
        },
      },
      matchFacts: {
        matchId: 5795442,
        topPlayers: {
          homeTopPlayers: [{
            playerId: 737066,
            name: { fullName: 'Erling Haaland' },
            playerRating: 8.4,
            positionLabel: { label: 'ST', key: 'striker_short' },
            manOfTheMatch: true,
          }],
          awayTopPlayers: [],
        },
        postReview: [{
          source: 'Opta', lang: 'en', title: 'Manchester City 1-0 Coventry City: report',
          shareUrl: 'https://www.fotmob.com/news/example', dateUpdated: '2026-09-05T16:18:35Z',
        }],
      },
    },
  };
}

test('球队统计扁平化后保留主客两列', () => {
  const stats = flattenTeamStats(fixtureDetails());
  assert.deepEqual(stats.expected_goals, ['2.12', '1.37']);
  assert.deepEqual(stats.BallPossesion, [78, 22]);
});

test('生成曼城视角中文赛后分析、关键球员和战术长文', () => {
  const details = fixtureDetails();
  const match = buildMatchAnalysis(details, {
    id: 5795442,
    pageUrl: '/matches/manchester-city-vs-coventry/abc#5795442',
    tournament: { name: 'Premier League' },
    status: { utcTime: '2026-09-05T14:00:00Z' },
  }, new Date('2026-09-05T18:00:00Z'));
  assert.equal(match.result, '胜');
  assert.equal(match.opponent.name, '考文垂');
  assert.equal(match.headline, '三分到手，但过程比比分更险');
  assert.match(match.verdict, /xG 2\.12-1\.37/);
  assert.equal(match.goals[0].player, '哈兰德');
  assert.equal(match.top_players[0].name, '哈兰德');
  assert.equal(match.top_players[0].metrics[0].label, '预期进球');
  assert.equal(match.tactical_longform.sections.length, 6);
  assert.match(match.tactical_longform.title, /考文垂/);
  assert.equal(match.tactical_longform.version, 3);
  assert.ok(match.tactical_longform.problems.length >= 3);
  assert.match(match.tactical_longform.problems.join(''), /控球|终结效率|防守端/);
  assert.match(match.tactical_longform.sections[0].paragraphs.join(''), /阵型/);
});

test('客场比赛仍按曼城视角计算比分和数据', () => {
  const details = fixtureDetails();
  details.header.teams.reverse();
  details.header.teams[0].score = 0;
  details.header.teams[1].score = 1;
  details.header.events = { homeTeamGoals: {}, awayTeamGoals: details.header.events.homeTeamGoals };
  const stats = details.content.stats.Periods.All.stats[0].stats;
  for (const item of stats) item.stats.reverse();
  details.content.matchFacts.topPlayers = {
    homeTopPlayers: [],
    awayTopPlayers: details.content.matchFacts.topPlayers.homeTopPlayers,
  };
  const match = buildMatchAnalysis(details, {
    id: 5795442,
    pageUrl: '/matches/manchester-city-vs-coventry/abc#5795442',
    tournament: { name: 'Premier League' },
  });
  assert.equal(match.is_home, false);
  assert.equal(match.result, '胜');
  assert.equal(match.stats[0].city, 78);
  assert.equal(match.goals[0].player, '哈兰德');
});

test('一线队页面直接展示中文战术长文，不再出现原文与数据按钮区', () => {
  assert.match(APP_SOURCE, /first-team-tactical-longform/);
  assert.match(APP_SOURCE, /中文战术复盘/);
  assert.doesNotMatch(APP_SOURCE, /原文与数据/);
  assert.doesNotMatch(APP_SOURCE, /阅读 Opta 战报/);
  assert.doesNotMatch(APP_SOURCE, /FotMob 比赛中心/);
  assert.doesNotMatch(APP_SOURCE, /曼城官方战报/);
});
