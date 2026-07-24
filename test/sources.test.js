import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTwitterFilters,
  twitterFeedUrl,
  twitterKeywordFeedUrl,
} from '../scripts/lib/sources.js';

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

test('ordinary user timeline URL remains compatible with the current RSSHub image', () => {
  assert.equal(
    twitterFeedUrl(
      { handle: 'etihadintel' },
      'http://127.0.0.1:1200/',
    ),
    'http://127.0.0.1:1200/twitter/user/etihadintel',
  );
});

test('Etihad Intel also gets an independent author search fallback', () => {
  assert.equal(
    twitterKeywordFeedUrl(
      { keyword_fallback: 'from:etihadintel' },
      'http://127.0.0.1:1200/',
    ),
    'http://127.0.0.1:1200/twitter/keyword/from%3Aetihadintel/forceWebApi=true',
  );
  assert.equal(
    twitterKeywordFeedUrl({}, 'http://127.0.0.1:1200/'),
    '',
  );
});
