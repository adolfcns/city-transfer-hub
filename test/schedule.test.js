import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTwitterSources, runAdaptiveTwitterSchedule } from '../scripts/lib/schedule.js';

const sources = [
  ['city_xtra', 'ITK'], ['tolmie', 'ITK'], ['etihad_intel', 'ITK'],
  ['romano', 'T0'], ['ornstein', 'T0'], ['jacobs', 'T1'], ['samlee', 'T1'],
  ['schira', 'T2'], ['plettenberg', 'T2'], ['tavolieri', 'T2'], ['aouna', 'T2'], ['br', 'T2'], ['nixon', 'T2'],
].map(([key, tier]) => ({ key, tier, type: 'twitter' }));
const settings = {
  twitter_every_run_tiers: ['ITK', 'T0', 'T1'],
  twitter_every_run: ['schira'],
  twitter_rotation_groups: 2,
};

test('全部 ITK/T0/T1 和斯基拉每轮必抓', () => {
  const expected = ['city_xtra', 'tolmie', 'etihad_intel', 'romano', 'ornstein', 'jacobs', 'samlee', 'schira'];
  for (let slot = 0; slot < 4; slot += 1) {
    assert.deepEqual(selectTwitterSources(sources, settings, slot).everyRun.map((source) => source.key), expected);
  }
});

test('剩余 T2 分为两组并交替优先', () => {
  const first = selectTwitterSources(sources, settings, 0);
  const second = selectTwitterSources(sources, settings, 1);
  assert.deepEqual(first.due.map((source) => source.key), ['plettenberg', 'aouna', 'nixon']);
  assert.deepEqual(first.overflow.map((source) => source.key), ['tavolieri', 'br']);
  assert.deepEqual(second.due.map((source) => source.key), ['tavolieri', 'br']);
  assert.deepEqual(second.overflow.map((source) => source.key), ['plettenberg', 'aouna', 'nixon']);
});

test('没有冲突时继续补抓另一组，实现一轮全抓', async () => {
  const schedule = selectTwitterSources(sources, settings, 0);
  const result = await runAdaptiveTwitterSchedule(schedule, async () => ({ ok: true }));
  assert.equal(result.conflicted, false);
  assert.equal(result.deferred.length, 0);
  assert.equal(result.attempted.length, sources.length);
});

test('T2 出现冲突时停止，剩余账号留到下一轮', async () => {
  const schedule = selectTwitterSources(sources, settings, 0);
  const result = await runAdaptiveTwitterSchedule(schedule, async (source) => (
    source.key === 'aouna' ? { ok: false, throttled: true } : { ok: true }
  ));
  assert.equal(result.conflicted, true);
  assert.deepEqual(result.deferred.map((source) => source.key), ['nixon', 'tavolieri', 'br']);
});
