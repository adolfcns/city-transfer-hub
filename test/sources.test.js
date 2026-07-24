import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTwitterFilters, twitterFeedUrl } from '../scripts/lib/sources.js';

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

test('Etihad Intel requests a larger Web API timeline', () => {
  assert.equal(
    twitterFeedUrl(
      {
        handle: 'etihadintel',
        route_params: 'count=50&includeRts=false&forceWebApi=true',
      },
      'http://127.0.0.1:1200/',
    ),
    'http://127.0.0.1:1200/twitter/user/etihadintel/count=50&includeRts=false&forceWebApi=true',
  );
});
