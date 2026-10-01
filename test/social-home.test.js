import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';
import { SOCIAL_SOURCE_KEYS, selectSocialSources, isCase115Post, isSocialPost } from '../scripts/fetch-social-feed.js';
import { makeMatchers } from '../scripts/lib/pipeline.js';

const html = fs.readFileSync('static/index.html', 'utf8');
const app = fs.readFileSync('static/app.js', 'utf8');
const css = fs.readFileSync('static/style.css', 'utf8');
const fetcher = fs.readFileSync('scripts/fetch-social-feed.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/fetch.yml', 'utf8');
const config = YAML.parse(fs.readFileSync('config/sources.yaml', 'utf8'));

test('社媒、比赛前瞻、赛后分析与蓝月在外使用四个稳定入口', () => {
  assert.match(html, /<title>曼城社媒｜跟队记者与蓝月消息源<\/title>/);
  assert.match(html, /<nav class="page-tabs" id="page-tabs" aria-label="主要页面">/);
  assert.match(html, /id="page-social" href="\.\/" aria-current="page">曼城社媒<\/a>/);
  assert.match(html, /id="page-preview" href="\.\/\?view=preview">比赛前瞻<\/a>/);
  assert.match(html, /id="page-analysis" href="\.\/\?view=analysis">赛后分析<\/a>/);
  assert.match(html, /id="page-loans" href="\.\/\?view=loans">蓝月在外<\/a>/);
  assert.match(html, /id="brand-slogan-copy">点击右侧看外租小将表现<\/span>/);
  assert.match(app, /REQUESTED_PAGE_VIEW = new URLSearchParams\(window\.location\.search\)/);
  assert.match(app, /IS_ANALYSIS_PAGE = PAGE_VIEW === 'analysis'/);
  assert.match(app, /IS_PREVIEW_PAGE = PAGE_VIEW === 'preview'/);
  assert.match(app, /loansTab\.classList\.toggle\('active', IS_LOAN_PAGE\)/);
  assert.match(app, /analysisTab\.classList\.toggle\('active', IS_ANALYSIS_PAGE\)/);
  assert.match(app, /socialTab\.classList\.toggle\('active', PAGE_VIEW === 'social'\)/);
  assert.match(app, /slogan\.textContent = '点击右侧看外租小将表现'/);
  assert.match(css, /\.page-tabs/);
  assert.match(css, /\.page-tab\.active/);
  assert.match(css, /\.social-home-intro/);
  assert.match(html, /class="loan-page-hero-link" href="\.\/\?view=loans"/);
  assert.match(html, /<h2>外租小将入口<\/h2>/);
  assert.match(css, /\.loan-page-hero-action/);
});

test('社媒抓取保留十个核心账号，并恢复转会窗完整 X 信源池', () => {
  assert.deepEqual([...SOCIAL_SOURCE_KEYS], [
    'city_xtra', 'bajkowski', 'samlee', 'gaughan', 'fpl_maine_road',
    'etihad_intel', 'mcfcous', 'city_report', 'tolmie', 'city_chief',
  ]);
  const selectedSources = selectSocialSources(config);
  assert.equal(selectedSources.length, 31);
  assert.deepEqual(selectedSources.slice(0, SOCIAL_SOURCE_KEYS.length).map((source) => source.key), [...SOCIAL_SOURCE_KEYS]);
  assert.ok(selectedSources.every((source) => source.type === 'twitter'));
  assert.equal(selectedSources.filter((source) => source.tier === 'ITK').length, 7);
  const shippedSourceCode = `${app}\n${fetcher}`;
  for (const name of [
    'City Xtra', 'Simon Bajkowski', 'Sam Lee', 'Jack Gaughan', 'FPL Maine Road',
    'Etihad Intel', 'mcfcous', 'City Report', "Tolmie's Hairdoo", 'City Chief',
  ]) assert.match(shippedSourceCode, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const matchers = makeMatchers(config);
  const cityXtra = selectSocialSources(config).find((source) => source.key === 'city_xtra');
  const samLee = selectSocialSources(config).find((source) => source.key === 'samlee');
  const tolmie = selectSocialSources(config).find((source) => source.key === 'tolmie');
  const cityChief = selectSocialSources(config).find((source) => source.key === 'city_chief');
  assert.equal(isSocialPost(cityXtra, 'A short club update without spelling out MCFC.', matchers), true);
  assert.equal(isSocialPost(tolmie, 'Something is moving. Soon. 👀', matchers), true);
  assert.equal(isSocialPost(cityChief, 'Training today. 🩵', matchers), true);
  assert.equal(isSocialPost(samLee, 'New Erling Haaland fitness update.', matchers), true);
  assert.equal(isSocialPost(samLee, 'Liverpool have made a bid for a winger.', matchers), false);
  const romano = selectedSources.find((source) => source.key === 'romano');
  assert.equal(isCase115Post('Update on the Manchester City 115 charges.'), true);
  assert.equal(isCase115Post('Manchester City await the independent commission ruling.'), true);
  assert.equal(isCase115Post('Liverpool have made a bid for a winger.'), false);
  assert.equal(isSocialPost(romano, 'Update on the 115 charges and possible appeal.' , matchers), true);
  assert.match(fetcher, /CASE_115/);
  assert.match(app, /CASE_115: '115案'/);
  assert.match(app, /SOCIAL_SOURCE_KEYS\.add\(source\.key\)/);
  assert.match(app, /filter\(\(item\) => SOCIAL_SOURCE_KEYS\.has\(item\.source_key\)\)/);
  assert.match(workflow, /TWITTER_AUTH_TOKEN/);
  assert.match(workflow, /node scripts\/fetch-social-feed\.js/);
});

test('本期社媒页不接入视频、Instagram 或训练图片流', () => {
  const shippedSocialCode = `${html}\n${app}\n${fetcher}`;
  assert.doesNotMatch(shippedSocialCode, /youtube|instagram|training image|训练图/i);
});
