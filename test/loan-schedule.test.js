import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync('static/app.js', 'utf8');
const helpers = app.slice(app.indexOf('function loanScheduleEntries('), app.indexOf('function loanWatchSummaryStat('));
const { loanScheduleEntries, loanSchedulePlayerStatus } = vm.runInNewContext(`${helpers}\n({ loanScheduleEntries, loanSchedulePlayerStatus })`);
const now = Date.parse('2026-09-05T10:00:00Z');
const fixture = (id, date, extras = {}) => ({ id, date, opponent: 'Visitors', ...extras });

test('完赛后保留一天，赛后记录不依赖已经转到下一场的 next_match', () => {
  const played = fixture('recent', '2026-09-05T00:00:00Z', { minutes: 75, rating: 7.8 });
  const next = fixture('next', '2026-09-06T12:00:00Z');
  const player = { key: 'player', matches: [played], schedule: [next], next_match: next };
  const rows = loanScheduleEntries([player], now);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].match, played);
  assert.equal(rows[0].phase, 'completed');
  assert.equal(loanSchedulePlayerStatus(rows[0]).label, '评分 7.8');
  assert.equal(rows[1].fixture.id, 'next');
});

test('保留窗口按完赛时间计算，旧快照使用两小时赛长估计', () => {
  const player = { key: 'player', matches: [
    fixture('still-visible', '2026-09-04T08:01:00Z'),
    fixture('expired', '2026-09-04T08:00:00Z'),
    fixture('explicit-end', '2026-09-04T07:00:00Z', { ended_at: '2026-09-04T10:05:00Z' }),
    fixture('invalid', 'not a date'),
    fixture('future-record', '2026-09-06T10:00:00Z'),
  ] };
  const rows = loanScheduleEntries([player], now);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].fixture.id, 'still-visible');
  assert.equal(rows[1].fixture.id, 'explicit-end');
});

test('赛程、next_match 与比赛记录去重，但同场涉及两名球员分别保留', () => {
  const match = fixture('shared', '2026-09-05T00:00:00Z', { minutes: 60, rating: 7 });
  const next = fixture('next', '2026-09-06T00:00:00Z');
  const later = fixture('later', '2026-09-07T00:00:00Z');
  const player = { key: 'first', matches: [match, match], schedule: [match, later, next], next_match: next };
  const rows = loanScheduleEntries([player, { key: 'second', matches: [match] }], now);
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((row) => row.fixture.id === 'shared').length, 2);
  assert.equal(rows.filter((row) => row.fixture.id === 'next').length, 1);
  assert.ok(!rows.some((row) => row.fixture.id === 'later'));
});

test('未回传的比赛保留待更新状态，不会误报球员未出场', () => {
  const rows = loanScheduleEntries([{ key: 'player', schedule: [
    fixture('pending', '2026-09-05T06:00:00Z'),
    fixture('started', '2026-09-05T09:00:00Z'),
    fixture('expired', '2026-09-03T09:00:00Z'),
  ] }], now);
  assert.equal(rows.length, 2);
  assert.equal(loanSchedulePlayerStatus(rows[0]).label, '赛后待更新');
  assert.equal(loanSchedulePlayerStatus(rows[1]).label, '已开赛');
  for (const appearance_status of ['not_in_squad', 'unused_sub']) {
    const status = loanSchedulePlayerStatus({ phase: 'completed', match: { minutes: 0, appearance_status } });
    assert.equal(status.label, '未出场');
  }
  assert.equal(loanSchedulePlayerStatus({ phase: 'completed', match: { minutes: 9, rating: null } }).label, '已出场 · 暂无评分');
  assert.equal(loanSchedulePlayerStatus({ phase: 'completed', match: { minutes: 0 } }).label, '出场情况待更新');
});
