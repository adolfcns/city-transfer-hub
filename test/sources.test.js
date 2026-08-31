import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchChelseaTransferGnews,
  resolveTwitterFilters,
  twitterFeedUrl,
  twitterKeywordFeedUrl,
} from '../scripts/lib/sources.js';
import { CHELSEA_WATCH_QUERIES } from '../scripts/lib/chelsea-watch.js';

test('Chelsea general and Camara searches both reject articles outside the trusted domain map', async () => {
  const outlet = { key: 'chelsea_telegraph', name: 'The Telegraph', tier: 'T0' };
  const domainMap = new Map([['telegraph.co.uk', outlet]]);
  const xml = `<rss><channel>
    <item><title>Chelsea target Lamine Camara - The Telegraph</title><link>https://news.google.com/articles/trusted</link><pubDate>Mon, 31 Aug 2026 08:00:00 GMT</pubDate><source url="https://www.telegraph.co.uk">The Telegraph</source></item>
    <item><title>Chelsea target Lamine Camara - Rumour Blog</title><link>https://news.google.com/articles/blog</link><pubDate>Mon, 31 Aug 2026 08:00:00 GMT</pubDate><source url="https://rumour.example">Rumour Blog</source></item>
    <item><title>Chelsea target Lamine Camara - Unknown</title><link>https://news.google.com/articles/unknown</link><pubDate>Mon, 31 Aug 2026 08:00:00 GMT</pubDate></item>
  </channel></rss>`;
  for (const { query } of CHELSEA_WATCH_QUERIES) {
    const entries = await fetchChelseaTransferGnews(domainMap, query, async (url, options) => {
      assert.equal(new URL(url).searchParams.get('q'), query);
      assert.deepEqual(options, { timeout: 12000, retries: 0 });
      return xml;
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].outlet.key, 'chelsea_telegraph');
    assert.equal(entries[0].text, 'Chelsea target Lamine Camara');
    assert.equal(entries[0].url, 'https://news.google.com/articles/trusted');
  }
});

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
