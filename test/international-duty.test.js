import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildInternationalDuty } from '../scripts/fetch-international-duty.js';

const config = JSON.parse(fs.readFileSync('config/international-duty.json', 'utf8'));
const html = fs.readFileSync('static/index.html', 'utf8');
const app = fs.readFileSync('static/app.js', 'utf8');
const css = fs.readFileSync('static/style.css', 'utf8');
const workflow = fs.readFileSync('.github/workflows/fetch.yml', 'utf8');

test('国家队页面收录曼城、阿森纳和利物浦一线队国脚', async () => {
  const city = config.clubs.find((club) => club.key === 'city');
  const arsenal = config.clubs.find((club) => club.key === 'arsenal');
  const liverpool = config.clubs.find((club) => club.key === 'liverpool');
  const allMatches = new Set(config.clubs.flatMap((club) => club.teams.flatMap((team) => team.fixtures.map((fixture) => fixture.id || fixture.match_key))));
  assert.equal(city.teams.flatMap((team) => team.players).length, 17);
  assert.equal(arsenal.teams.flatMap((team) => team.players).length, 15);
  assert.equal(city.teams.length, 13);
  assert.equal(arsenal.teams.length, 9);
  assert.equal(liverpool.teams.flatMap((team) => team.players).length, 20);
  assert.equal(liverpool.teams.length, 14);
  assert.equal(allMatches.size, 68);

  const data = await buildInternationalDuty(
    config,
    null,
    new Date('2026-09-23T12:00:00Z'),
    async () => { throw new Error('赛前不应请求详情'); },
    async () => { throw new Error('赛前不应解析赛程'); },
    async () => ({ squad: { squad: [] } }),
  );
  assert.equal(data.fetch.requests, 3);
  assert.equal(data.fetch.injury_requests, 3);
  assert.equal(data.summary.players, 52);
  assert.equal(data.summary.matches, 68);
  assert.deepEqual(data.clubs.map((club) => club.summary.players), [17, 15, 20]);
  assert.deepEqual(data.clubs.map((club) => club.players.length), [17, 15, 20]);
  assert.ok(data.clubs.every((club) => club.teams.every((team) => team.fixtures.every((fixture) => fixture.status === '未开赛'))));
});

test('每名球员显示伤情并把俱乐部伤病请求限制为每六小时一次', async () => {
  const injuryConfig = {
    version: 3,
    title: '伤情测试',
    clubs: [{
      key: 'arsenal', name: '阿森纳', name_en: 'Arsenal', badge: '🔴', fotmob_id: 9825,
      teams: [{
        key: 'netherlands', name: '荷兰', name_en: 'Netherlands', flag: '🇳🇱',
        players: [{ name: '廷贝尔', name_en: 'Jurrien Timber', aliases: ['Jurriën Timber'] }],
        fixtures: [],
      }],
    }],
  };
  const teamData = {
    squad: { squad: [{ title: 'defenders', members: [{ name: 'Jurriën Timber', injured: true, injury: { expectedReturn: 'Doubtful' } }] }] },
  };
  const first = await buildInternationalDuty(
    injuryConfig,
    null,
    new Date('2026-09-25T02:00:00Z'),
    async () => ({}),
    async () => ({}),
    async () => teamData,
  );
  assert.equal(first.fetch.injury_requests, 1);
  assert.equal(first.summary.injured, 1);
  assert.deepEqual(first.clubs[0].players[0].injury, {
    injured: true,
    status: 'injured',
    label: '受伤 · 出战成疑',
    expected_return: 'Doubtful',
    checked_at: '2026-09-25T02:00:00.000Z',
  });

  const cached = await buildInternationalDuty(
    injuryConfig,
    first,
    new Date('2026-09-25T04:00:00Z'),
    async () => ({}),
    async () => ({}),
    async () => { throw new Error('六小时内不应再次请求伤情'); },
  );
  assert.equal(cached.fetch.injury_requests, 0);
  assert.equal(cached.clubs[0].players[0].injury.label, '受伤 · 出战成疑');
});

test('完赛约一小时后写入首发状态和实际分钟', async () => {
  const miniConfig = {
    version: 1,
    title: '测试',
    window: '测试',
    source: {},
    teams: [{
      key: 'norway', name: '挪威', name_en: 'Norway', flag: '🇳🇴',
      players: [{ name: '哈兰德', name_en: 'Erling Haaland', aliases: ['Erling Haaland'] }],
      fixtures: [{ id: '1', kickoff_at: '2026-09-24T18:45:00Z', home: '挪威', away: '丹麦', home_en: 'Norway', away_en: 'Denmark' }],
    }],
  };
  const details = {
    header: { status: { finished: true }, teams: [{ score: 2 }, { score: 0 }] },
    content: {
      lineup: { homeTeam: { name: 'Norway', starters: [{ id: 9, name: 'Erling Haaland', performance: {} }], subs: [] } },
      playerStats: { '9': { stats: [{ stats: { minutes: { key: 'minutes_played', stat: { value: 90 } } } }] } },
    },
  };
  const data = await buildInternationalDuty(miniConfig, null, new Date('2026-09-24T22:00:00Z'), async () => details);
  const fixture = data.clubs[0].teams[0].fixtures[0];
  assert.equal(data.fetch.requests, 1);
  assert.equal(fixture.status, '完场');
  assert.equal(fixture.score, '2-0');
  assert.deepEqual(fixture.appearances[0], { name: '哈兰德', name_en: 'Erling Haaland', status: '首发', minutes: 90 });
  assert.equal(data.clubs[0].players[0].summary.minutes, 90);
  assert.equal(data.clubs[0].summary.minutes, 90);
  assert.equal(data.clubs[0].summary.appearances, 1);

  const withoutPlayerStats = structuredClone(details);
  withoutPlayerStats.content.playerStats = {};
  const fallback = await buildInternationalDuty(miniConfig, null, new Date('2026-09-24T22:00:00Z'), async () => withoutPlayerStats);
  assert.equal(fallback.clubs[0].players[0].summary.minutes, 90);
});

test('国家队追踪按球员展示三队总时间对比并定时更新', () => {
  assert.match(html, /id="page-internationals" href="\.\/\?view=internationals">国家队追踪<\/a>/);
  assert.match(html, /id="international-duty-home"/);
  assert.match(app, /IS_INTERNATIONALS_PAGE = PAGE_VIEW === 'internationals'/);
  assert.match(app, /loadInternationalDutyHome/);
  assert.match(app, /球员出场时间榜/);
  assert.match(app, /俱乐部累计出场时间/);
  assert.match(app, /international-player-injury/);
  assert.match(css, /\.international-player-board/);
  assert.match(css, /\.international-club-totals/);
  assert.match(css, /\.international-player-injury\.injured/);
  assert.match(css, /body\[data-page="internationals"\]/);
  assert.match(workflow, /Update international appearances/);
  assert.match(workflow, /PREV_INTERNATIONAL_DUTY_URL/);
});
