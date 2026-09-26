import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, app, css] = await Promise.all([
  readFile(new URL('../static/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../static/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../static/style.css', import.meta.url), 'utf8'),
]);

test('115 explanation has the requested title and substantive breakdown', () => {
  assert.match(html, /关于115指控你可能需要知道的/);
  for (const count of ['54', '14', '12', '35']) {
    assert.match(html, new RegExp(`<b>${count}<\\/b>`));
  }
  assert.match(html, /约10%/);
  assert.match(html, /20%至30%/);
  assert.match(html, /40%至60%/);
  assert.match(html, /不是官方概率/);
});

test('115 explanation opens once automatically and remains manually available', () => {
  assert.match(html, /id="btn-115-explainer"/);
  assert.match(html, /id="case-115-notice"/);
  assert.match(app, /const CASE_115_NOTICE_KEY = 'cth_case_115_notice_20260926_v1'/);
  assert.match(app, /scheduleCase115Notice\(\);/);
  assert.match(app, /\$\('#btn-115-explainer'\)\.onclick = openCase115Notice/);
  assert.match(app, /localStorage\.setItem\(CASE_115_NOTICE_KEY, 'seen'\)/);
});

test('115 popup is responsive and keeps source links', () => {
  assert.match(css, /\.modal\.case-115-notice/);
  assert.match(css, /\.case-115-counts/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(html, /premierleague\.com\/en\/news\/3045970/);
  assert.match(html, /bbc\.co\.uk\/sport\/football\/articles\/cvgvrz8zpvro/);
  assert.match(html, /CAS_Award_6785/);
  assert.match(html, /theguardian\.com\/football\/2026\/sep\/25\/manchester-city-found-guilty/);
});

test('115 popup copy avoids the most obvious canned AI phrasing', () => {
  const popup = html.match(/<div class="modal case-115-notice"[\s\S]*?<\/article>\s*<\/div>/)?.[0] || '';
  assert.ok(popup);
  assert.doesNotMatch(popup, /这不仅|真正的问题|核心中的核心|值得注意的是|综上所述|—/);
});
