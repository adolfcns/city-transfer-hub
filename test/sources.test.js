import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTwitterFilters } from '../scripts/lib/sources.js';

test('ordinary X sources keep the global reply and retweet filters', () => {
  assert.deepEqual(
    resolveTwitterFilters({ key: 'ordinary' }, { excludeReplies: true, excludeRetweets: true }),
    { excludeReplies: true, excludeRetweets: true },
  );
});

test('Etihad Intel can keep replies while still excluding retweets', () => {
  assert.deepEqual(
    resolveTwitterFilters(
      { key: 'etihad_intel', include_replies: true },
      { excludeReplies: true, excludeRetweets: true },
    ),
    { excludeReplies: false, excludeRetweets: true },
  );
});
