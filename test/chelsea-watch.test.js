import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';
import { classifyChelseaWatch, isChelseaWatchItem } from '../scripts/lib/chelsea-watch.js';

test('蓝桥雷达收录切尔西各位置引援，不局限中场', () => {
  assert.equal(classifyChelseaWatch('Chelsea agree deal to sign a new centre-back after talks today.'), 'chelsea_incoming');
  assert.equal(classifyChelseaWatch('Chelsea submit an opening bid for the winger.'), 'chelsea_incoming');
  assert.equal(classifyChelseaWatch('The striker is expected to join Chelsea after his medical.'), 'chelsea_incoming');
  assert.equal(classifyChelseaWatch('Alejandro Garnett to Chelsea, here we go!'), 'chelsea_incoming');
  assert.equal(classifyChelseaWatch('切尔西已报价引进一名新的左后卫。'), 'chelsea_incoming');
});

test('恩佐加盟曼城的直接动态始终进入蓝桥雷达', () => {
  assert.equal(classifyChelseaWatch('Manchester City open talks with Chelsea for Enzo Fernandez.'), 'enzo_city');
  assert.equal(classifyChelseaWatch('切尔西愿意出售恩佐，曼城已经开始谈判。'), 'enzo_city');
});

test('蓝桥雷达排除比赛、伤病、续约、女足和普通离队', () => {
  const rejected = [
    'Chelsea beat Arsenal 2-0 at Stamford Bridge.',
    'Chelsea injury update ahead of the weekend match.',
    'Chelsea star signs a new contract until 2031.',
    'Chelsea Women agree deal to sign a new striker.',
    'The defender will leave Chelsea and join Milan.',
    'Chelsea accept a bid from Barcelona for their midfielder.',
    "Liam Delap joins Nottingham Forest in a £50m deal as Chelsea make profit on striker.",
    "Chelsea: Does the manager need a last-minute goalkeeper signing?",
    "Chelsea: Does Xabi Alonso need a last-minute goalkeeper signing after the derby?",
    "Chelsea announce a new front-of-shirt sponsorship deal with a financial platform.",
    "Enzo Fernandez transfer news: Manchester City confident of signing Chelsea midfielder - Paper Talk",
    'Manchester City are targeting a new right-back.',
  ];
  for (const value of rejected) assert.equal(isChelseaWatchItem(value), false, value);
});

test('首页预留独立蓝桥雷达数据流，且不混入普通消息筛选', () => {
  const app = fs.readFileSync('static/app.js', 'utf8');
  const fetchScript = fs.readFileSync('scripts/fetch.js', 'utf8');
  const workflow = fs.readFileSync('.github/workflows/fetch.yml', 'utf8');
  const style = fs.readFileSync('static/style.css', 'utf8');
  assert.match(app, /CHELSEA_WATCH_URL/);
  assert.match(app, /renderChelseaWatchModule/);
  assert.match(app, /蓝桥引援雷达/);
  assert.match(app, /可信白名单：切尔西官方、跟队记者与一线转会记者/);
  assert.match(app, /renderChelseaWatchModule\(zone\);\s*const banner =/);
  assert.match(fetchScript, /writeFile\(resolve\(DATA_DIR, 'chelsea-watch\.json'\)/);
  assert.match(fetchScript, /chelseaReusableSources = sources\.filter/);
  assert.match(fetchScript, /\[\.\.\.chelseaReusableSources, \.\.\.chelseaWatchTimelineSources\]/);
  assert.match(fetchScript, /chelseaDomainMap = buildDomainMap\(chelseaWatchSources\.filter/);
  assert.match(fetchScript, /allowsChelseaWatchSource\(source\.key, watchType\)/);
  assert.match(workflow, /PREV_CHELSEA_WATCH_URL/);
  assert.match(style, /\.chelsea-watch-grid/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.chelsea-watch:not\(\.is-open\) \.chelsea-watch-card:nth-child\(n\+2\)/);
});

test('蓝桥雷达只使用切尔西官方、跟队与一线记者白名单', () => {
  const cfg = YAML.parse(fs.readFileSync('config/sources.yaml', 'utf8'));
  const sources = cfg.chelsea_watch_sources || [];
  const handles = new Set(sources.map((source) => source.handle).filter(Boolean));
  const sites = new Set(sources.map((source) => source.site).filter(Boolean));
  const sourceKeys = new Set([
    ...(cfg.settings.chelsea_watch_global_source_keys || []),
    ...(cfg.settings.chelsea_watch_enzo_only_source_keys || []),
  ]);

  for (const handle of ['Matt_Law_DT', 'NizaarKinsella', 'SJohnsonSport', 'liam_twomey', 'kierangill_DM']) {
    assert.ok(handles.has(handle), `${handle} 应在切尔西跟队白名单`);
  }
  for (const site of ['chelseafc.com', 'nytimes.com/athletic', 'telegraph.co.uk', 'bbc.co.uk', 'skysports.com']) {
    assert.ok(sites.has(site), `${site} 应在权威域名白名单`);
  }
  for (const key of ['romano', 'ornstein', 'jacobs', 'hawkins', 'city_xtra', 'etihad_intel', 'mcfcous']) {
    assert.ok(sourceKeys.has(key), `${key} 应在复用信源白名单`);
  }
  for (const key of ['goal', 'teamtalk', 'talksport', 'espn', 'schira']) {
    assert.equal(sourceKeys.has(key), false, `${key} 不得进入蓝桥雷达白名单`);
  }
});
