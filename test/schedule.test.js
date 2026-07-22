import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTwitterSources } from '../scripts/lib/schedule.js';

const sources = ['city_xtra', 'tolmie', 'romano', 'schira', 'etihad_intel', 'a', 'b', 'c', 'd', 'e', 'f']
  .map((key) => ({ key, type: 'twitter' }));
const settings = {
  twitter_every_run: ['city_xtra', 'tolmie', 'romano', 'schira', 'etihad_intel'],
  twitter_rotation_groups: 3,
};

test('五个重点信源每轮都会抓取', () => {
  for (let slot = 0; slot < 6; slot += 1) {
    const selected = new Set(selectTwitterSources(sources, settings, slot).selected.map((source) => source.key));
    for (const key of settings.twitter_every_run) assert.equal(selected.has(key), true, `${key} missing at slot ${slot}`);
  }
});

test('其余信源三轮覆盖一次且不会重复', () => {
  const seen = new Map();
  for (let slot = 0; slot < 3; slot += 1) {
    const schedule = selectTwitterSources(sources, settings, slot);
    for (const source of schedule.selected.filter((item) => !settings.twitter_every_run.includes(item.key))) {
      seen.set(source.key, (seen.get(source.key) || 0) + 1);
    }
  }
  assert.deepEqual(Object.fromEntries(seen), { a: 1, d: 1, b: 1, e: 1, c: 1, f: 1 });
});
