import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../static/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../static/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../static/style.css', import.meta.url), 'utf8');
const data = JSON.parse(readFileSync(new URL('../data/match-preview.json', import.meta.url), 'utf8'));

test('比赛前瞻是独立且显眼的第四个页面', () => {
  assert.match(html, /id="page-preview" href="\.\/\?view=preview">比赛前瞻<\/a>/);
  assert.match(html, /id="match-preview-home"/);
  assert.match(html, /class="loan-page-hero-link preview" href="\.\/\?view=preview"/);
  assert.match(app, /IS_PREVIEW_PAGE = PAGE_VIEW === 'preview'/);
  assert.match(app, /loadMatchPreviewHome/);
  assert.match(css, /body\[data-page="preview"\] \.container/);
});

test('波尔图前瞻包含赛程、近况、重点球员和完整战术拆解', () => {
  assert.equal(data.match.id, 6106286);
  assert.equal(data.match.opponent, '波尔图');
  assert.equal(data.match.kickoff, '2026-09-08T19:00:00.000Z');
  assert.equal(data.recent_form.length, 5);
  assert.ok(data.season_numbers.length >= 6);
  assert.ok(data.danger_players.length >= 5);
  assert.ok(data.sections.length >= 8);
  assert.match(data.sections.map((section) => section.heading).join(' '), /怎么踢|压迫|最强|口子|曼城拿球|曼城无球|换人|开场15分钟/);
});

test('前瞻用直接中文说明战术，不使用空泛或过度防御措辞', () => {
  const copy = JSON.stringify(data);
  assert.match(copy, /第三人|弱侧|边路围抢|维加|迪奥戈·科斯塔/);
  assert.doesNotMatch(copy, /作为一个AI|仅供参考|不能说明|不能代替|不代表|先不下结论|先不硬评|背锅/);
  assert.ok(data.sources.length >= 4);
});
