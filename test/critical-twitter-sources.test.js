import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';
import { selectTwitterSources } from '../scripts/lib/schedule.js';

const config = YAML.parse(fs.readFileSync('config/sources.yaml', 'utf8'));

test('mcfcous and FPL Maine Road are unfiltered critical sources fetched every run', () => {
  const criticalKeys = ['mcfcous', 'fpl_maine_road'];
  const twitterSources = config.sources.filter((source) => source.type === 'twitter');
  const selected = selectTwitterSources(twitterSources, config.settings, 0);
  const everyRunKeys = new Set(selected.everyRun.map((source) => source.key));

  for (const key of criticalKeys) {
    const source = twitterSources.find((candidate) => candidate.key === key);
    assert.ok(source, `${key} must be configured`);
    assert.equal(source.tier, 'ITK');
    assert.equal(source.filter, 'none');
    assert.equal(source.include_replies, true);
    assert.equal(everyRunKeys.has(key), true);
  }
});
