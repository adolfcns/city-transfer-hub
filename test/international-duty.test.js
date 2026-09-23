import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildInternationalDuty } from '../scripts/fetch-international-duty.js';

const config = JSON.parse(fs.readFileSync('config/international-duty.json', 'utf8'));
const html = fs.readFileSync('static/index.html', 'utf8');
const app = fs.readFileSync('static/app.js', 'utf8');
const css = fs.readFileSync('static/style.css', 'utf8');
const workflow = fs.readFileSync('.github/workflows/fetch.yml', 'utf8');

test('国家队页面收录曼城与阿森纳全部成年国脚', async () => {
  const city = config.clubs.find((club) => club.key === 'city');
  const arsenal = config.clubs.find((club) => club.key === 'arsenal');
  const allMatches = new Set(config.clubs.flatMap((club) => club.teams.flatMap((team) => team.fixtures.map((fixture) => fixture.id || fixture.match_key))));
  assert.equal(city.teams.flatMap((team) => team.players).length, 17);
  assert.equal(arsenal.teams.flatMap((team) => team.players).length, 15);
  assert.equal(city.teams.length, 13);
  assert.equal(arsenal.teams.length, 9);
  assert.equal(allMatches.size, 52);

  const data = await buildInternationalDuty(config, null, new Date('2026-09-23T12:00:00Z'), async () => {
    throw new Error('赛前不应请求详情');
  });
  assert.equal(data.fetch.requests, 0);
  assert.equal(data.summary.players, 32);
  assert.equal(data.summary.matches, 52);
  assert.deepEqual(data.clubs.map((club) => club.summary.players), [17, 15]);
  assert.ok(data.clubs.every((club) => club.teams.every((team) => team.fixtures.every((fixture) => fixture.status === '未开赛'))));
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
});

test('国家队追踪拥有独立入口、双队对比和定时更新步骤', () => {
  assert.match(html, /id="page-internationals" href="\.\/\?view=internationals">国家队追踪<\/a>/);
  assert.match(html, /id="international-duty-home"/);
  assert.match(app, /IS_INTERNATIONALS_PAGE = PAGE_VIEW === 'internationals'/);
  assert.match(app, /loadInternationalDutyHome/);
  assert.match(css, /\.international-duty-grid/);
  assert.match(css, /\.international-club-comparison/);
  assert.match(css, /body\[data-page="internationals"\]/);
  assert.match(workflow, /Update international appearances/);
  assert.match(workflow, /PREV_INTERNATIONAL_DUTY_URL/);
});
