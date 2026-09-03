import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';
import { SOCIAL_SOURCE_KEYS, selectSocialSources, isSocialPost } from '../scripts/fetch-social-feed.js';
import { makeMatchers } from '../scripts/lib/pipeline.js';

const html = fs.readFileSync('static/index.html', 'utf8');
const app = fs.readFileSync('static/app.js', 'utf8');
const css = fs.readFileSync('static/style.css', 'utf8');
const fetcher = fs.readFileSync('scripts/fetch-social-feed.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/fetch.yml', 'utf8');
const config = YAML.parse(fs.readFileSync('config/sources.yaml', 'utf8'));

test('社媒首页与蓝月在外使用两个稳定入口', () => {
  assert.match(html, /<title>曼城社媒｜跟队记者与蓝月消息源<\/title>/);
  assert.match(html, /<nav class="page-tabs" id="page-tabs" aria-label="主要页面">/);
  assert.match(html, /id="page-social" href="\.\/" aria-current="page">曼城社媒<\/a>/);
  assert.match(html, /id="page-loans" href="\.\/\?view=loans">蓝月在外<\/a>/);
  assert.match(html, /id="brand-slogan-copy">点击右侧看外租小将表现<\/span>/);
  assert.match(app, /PAGE_VIEW = new URLSearchParams\(window\.location\.search\)/);
  assert.match(app, /loansTab\.classList\.toggle\('active', IS_LOAN_PAGE\)/);
  assert.match(app, /socialTab\.classList\.toggle\('active', !IS_LOAN_PAGE\)/);
  assert.match(app, /slogan\.textContent = '点击右侧看外租小将表现'/);
  assert.match(css, /\.page-tabs/);
  assert.match(css, /\.page-tab\.active/);
  assert.match(css, /\.social-home-intro/);
  assert.match(html, /class="loan-page-hero-link" href="\.\/\?view=loans"/);
  assert.match(html, /<h2>外租小将入口<\/h2>/);
  assert.match(css, /\.loan-page-hero-action/);
});

test('社媒抓取与前台严格限定九个指定 X 信源', () => {
  assert.deepEqual([...SOCIAL_SOURCE_KEYS], [
    'city_xtra', 'bajkowski', 'samlee', 'gaughan', 'fpl_maine_road',
    'etihad_intel', 'mcfcous', 'city_report', 'tolmie',
  ]);
  assert.deepEqual(selectSocialSources(config).map((source) => source.key), [...SOCIAL_SOURCE_KEYS]);
  const shippedSourceCode = `${app}\n${fetcher}`;
  for (const name of [
    'City Xtra', 'Simon Bajkowski', 'Sam Lee', 'Jack Gaughan', 'FPL Maine Road',
    'Etihad Intel', 'mcfcous', 'City Report', "Tolmie's Hairdoo",
  ]) assert.match(shippedSourceCode, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const matchers = makeMatchers(config);
  const cityXtra = selectSocialSources(config).find((source) => source.key === 'city_xtra');
  const samLee = selectSocialSources(config).find((source) => source.key === 'samlee');
  const tolmie = selectSocialSources(config).find((source) => source.key === 'tolmie');
  assert.equal(isSocialPost(cityXtra, 'A short club update without spelling out MCFC.', matchers), true);
  assert.equal(isSocialPost(tolmie, 'Something is moving. Soon. 👀', matchers), true);
  assert.equal(isSocialPost(samLee, 'New Erling Haaland fitness update.', matchers), true);
  assert.equal(isSocialPost(samLee, 'Liverpool have made a bid for a winger.', matchers), false);
  assert.match(app, /filter\(\(item\) => SOCIAL_SOURCE_KEYS\.has\(item\.source_key\)\)/);
  assert.match(workflow, /TWITTER_AUTH_TOKEN/);
  assert.match(workflow, /node scripts\/fetch-social-feed\.js/);
});

test('本期社媒页不接入视频、Instagram 或训练图片流', () => {
  const shippedSocialCode = `${html}\n${app}\n${fetcher}`;
  assert.doesNotMatch(shippedSocialCode, /youtube|instagram|training image|训练图/i);
});
