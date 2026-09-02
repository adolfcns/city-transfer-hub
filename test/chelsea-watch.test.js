import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';
import { CHELSEA_WATCH_QUERIES, classifyChelseaWatch, isChelseaCamaraFocus, isChelseaKoneFocus, isChelseaWatchItem, prioritizeChelseaWatchItems } from '../scripts/lib/chelsea-watch.js';

test('蓝桥雷达聚焦中场，排除前锋、后卫和门将引援', () => {
  assert.equal(classifyChelseaWatch('Chelsea agree deal to sign a new midfielder after talks today.'), 'chelsea_incoming');
  assert.equal(classifyChelseaWatch('Chelsea submit an opening bid for Alex Scott.'), 'chelsea_incoming');
  assert.equal(classifyChelseaWatch('切尔西已报价引进一名新的后腰。'), 'chelsea_incoming');
  for (const text of [
    'Chelsea agree deal to sign a new centre-back after talks today.',
    'Chelsea submit an opening bid for the winger.',
    'The striker is expected to join Chelsea after his medical.',
    'Alejandro Garnett to Chelsea, here we go!',
    '切尔西已报价引进一名新的左后卫。',
  ]) assert.equal(classifyChelseaWatch(text), null, text);
});

test('恩佐加盟曼城的直接动态始终进入蓝桥雷达', () => {
  assert.equal(classifyChelseaWatch('Manchester City open talks with Chelsea for Enzo Fernandez.'), 'enzo_city');
  assert.equal(classifyChelseaWatch('切尔西愿意出售恩佐，曼城已经开始谈判。'), 'enzo_city');
});

test('卡马拉重点只识别拉明与切尔西的转会报道，不混入同姓球员或比赛', () => {
  const accepted = [
    'Chelsea believed to be progressing with their interest in Monaco midfielder Lamine Camara #cfc',
    'Chelsea are exploring midfield options, with talks ongoing with Lamine Camara.',
    'Lamine Camara to Chelsea, here we go!',
    "Chelsea target Monaco’s midfielder Camara.",
    '切尔西正在谈判引进摩纳哥中场拉明·卡马拉。',
    '切尔西有意摩纳哥中场卡马拉。',
    'Manchester City bid for Enzo Fernandez while Chelsea target Lamine Camara.',
  ];
  for (const text of accepted) assert.equal(isChelseaCamaraFocus(text), true, text);
  const rejected = [
    'Chelsea are interested in Boubacar Kamara.',
    'Chelsea bid for Mohamed Camara.',
    'Chelsea interested in Camara.', // 无名字/母队依据，不能把所有同姓球员都当成拉明
    'Manchester City target Lamine Camara.',
    'Lamine Camara scores against Chelsea.',
    'Chelsea announce a new contract for Lamine Camara.',
    'Chelsea Women target Lamine Camara.',
    'Lamine Camara will leave Chelsea and join Milan.',
    'Chelsea sign Emiliano Martinez and target Lamine Camara.', // 保留用户要求的大马丁硬排除
  ];
  for (const text of rejected) assert.equal(isChelseaCamaraFocus(text), false, text);
});

test('非科内条目按新到旧排序，历史重点标记会重算且原数组不变', () => {
  const items = [
    { id: 'other-new', text: 'Chelsea bid for a striker.', published_at: '2026-08-31T12:00:00Z', watch_focus: 'lamine_camara' },
    { id: 'camara-old', text: 'Chelsea target Lamine Camara.', published_at: '2026-08-28T12:00:00Z' },
    { id: 'other-old', text: 'Chelsea sign a winger.', published_at: '2026-08-29T12:00:00Z' },
    { id: 'camara-new', text: 'Chelsea open talks for Lamine Camara.', published_at: '2026-08-30T12:00:00Z' },
  ];
  const before = structuredClone(items);
  const ranked = prioritizeChelseaWatchItems(items);
  assert.deepEqual(ranked.map((item) => item.id), ['other-new', 'camara-new', 'other-old', 'camara-old']);
  assert.deepEqual(ranked.map((item) => item.watch_focus), [null, 'lamine_camara', null, 'lamine_camara']);
  assert.deepEqual(items, before);
});

test('卡马拉和科内增加专门检索并与原雷达并行，重点展示不增加普通消息流负担', () => {
  assert.equal(CHELSEA_WATCH_QUERIES.length, 5);
  assert.equal(CHELSEA_WATCH_QUERIES.find((search) => search.key === 'watch_chelsea_camara')?.query, '"Lamine Camara" Chelsea when:7d');
  assert.equal(CHELSEA_WATCH_QUERIES.find((search) => search.key === 'watch_chelsea_kone')?.query, '"Manu Kone" (Chelsea OR Roma) when:7d');
  assert.deepEqual(CHELSEA_WATCH_QUERIES.filter((search) => search.locale).map((search) => search.locale), ['fr', 'it']);
  const fetchScript = fs.readFileSync('scripts/fetch.js', 'utf8');
  const app = fs.readFileSync('static/app.js', 'utf8');
  const style = fs.readFileSync('static/style.css', 'utf8');
  assert.match(fetchScript, /Promise\.all\(CHELSEA_WATCH_QUERIES\.map/);
  assert.match(fetchScript, /fetchChelseaTransferGnews\(chelseaDomainMap, query, undefined, locale\)/);
  assert.match(fetchScript, /prioritizeChelseaWatchItems\(chelseaWatchMerged\)\.slice/);
  assert.match(app, /watch_focus === 'lamine_camara'/);
  assert.match(app, /重点·卡马拉/);
  assert.match(app, /科内优先 · 切尔西其他中场引援同步追踪/);
  assert.match(app, /切尔西中场消息筛选/);
  assert.match(style, /\.chelsea-watch-card\.is-camara/);
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
    "Aston Villa strike agreement with Chelsea to sign Nicolas Jackson. The player is moving from #CFC to #AVFC.",
    "The two clubs are now negotiating with Chelsea over a deal worth around £65m for Nicolas Jackson.",
    "Chelsea have turned down an approach from Roma to loan Jamie Gittens. He will remain at the club.",
    "Nicolas Jackson is travelling to the Midlands today to undergo his Aston Villa medical #avfc #cfc.",
    "Chelsea have agreed a deal to sign Emiliano Martinez from Aston Villa.",
    "Emi Martínez signs for Chelsea on a three-year contract.",
    "切尔西官方宣布签下埃米利亚诺·马丁内斯。",
    "大马丁加盟切尔西，交易已经完成。",
    'Manchester City are targeting a new right-back.',
  ];
  for (const value of rejected) assert.equal(isChelseaWatchItem(value), false, value);
});

test('首页切换为蓝月在外并停止转会新闻抓取', () => {
  const app = fs.readFileSync('static/app.js', 'utf8');
  const index = fs.readFileSync('static/index.html', 'utf8');
  const workflow = fs.readFileSync('.github/workflows/fetch.yml', 'utf8');
  const startup = app.slice(app.lastIndexOf('// ---------------- 启动 ----------------'));
  assert.match(index, /id="loan-watch-home"/);
  assert.match(index, /id="feed"[^>]*hidden/);
  assert.match(app, /const ACTIVE_SURVEY_IDS = new Set\(\['summer_2026', DEPARTURE_SURVEY_ID\]\)/);
  assert.match(startup, /loadLoanWatchHome\(\)/);
  assert.doesNotMatch(startup, /loadData\(\)|renderChelseaWatchModule\(|renderSeasonBlessingModule\(/);
  assert.match(workflow, /node scripts\/fetch-loan-watch\.js/);
  assert.doesNotMatch(workflow, /node scripts\/fetch\.js|PREV_CHELSEA_WATCH_URL/);
});

test('科内识别罗马马努，不混入同姓球员；两条重点都接纳辟谣', () => {
  for (const text of [
    'Chelsea contact Manu Koné agents. No bid has been made to Roma.',
    'Chelsea have Roma midfielder Kone high on their transfer list.',
    '切尔西接触罗马中场马努·科内。',
    'Aucun accord avec Chelsea pour Manu Koné.',
    'Roma hope to keep Manu Kone.',
    'Roma demand €70m for Manu Kone. The midfielder is not for sale.',
    'La Roma considera Manu Koné incedibile.',
  ]) assert.equal(isChelseaKoneFocus(text), true, text);
  for (const text of [
    'Chelsea target Ismael Kone.', 'Chelsea interested in Kone.',
    'Manu Kone scores against Chelsea.',
  ]) assert.equal(isChelseaKoneFocus(text), false, text);
  assert.equal(isChelseaCamaraFocus("À ce stade il n'y a encore AUCUN accord avec Chelsea pour Lamine Camara qui joue ce soir face à l'OM"), true);
});

test('科内最高优先，其余按时间排序，同一条提及两人以科内为主标签', () => {
  const items = prioritizeChelseaWatchItems([
    { id: 'camara', text: 'Chelsea target Lamine Camara.', published_at: '2026-08-30T12:00:00Z' },
    { id: 'kone', text: 'Chelsea target Manu Kone.', published_at: '2026-08-31T12:00:00Z' },
    { id: 'both', text: 'Chelsea contact Manu Kone and Lamine Camara agents.', published_at: '2026-08-31T13:00:00Z' },
    { id: 'other', text: 'Chelsea sign a winger.', published_at: '2026-08-31T14:00:00Z' },
  ]);
  assert.deepEqual(items.map((item) => item.id), ['both', 'kone', 'other', 'camara']);
  assert.deepEqual(items[0].watch_targets, ['manu_kone', 'lamine_camara']);
  assert.equal(items[0].watch_focus, 'manu_kone');
  const combined = prioritizeChelseaWatchItems([{ text: 'Chelsea target Alex Scott to replace Enzo Fernandez, who could join Manchester City.', published_at: '2026-08-31T14:00:00Z' }])[0];
  assert.equal(combined.watch_type, 'enzo_city');
  assert.equal(combined.watch_midfield, true);
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
  for (const key of ['romano', 'ornstein', 'jacobs', 'hawkins', 'dimarzio', 'city_xtra', 'etihad_intel', 'mcfcous']) {
    assert.ok(sourceKeys.has(key), `${key} 应在复用信源白名单`);
  }
  for (const key of ['goal', 'teamtalk', 'talksport', 'espn', 'schira']) {
    assert.equal(sourceKeys.has(key), false, `${key} 不得进入蓝桥雷达白名单`);
  }
});

test('当前线上误匹配回归：马雷斯卡、外租、女足、专栏和无关位置不得混入', () => {
  for (const text of [
    'Swansea agree deal to sign Jeremy Monga from Manchester City, here we go! Approved by MCFC and Enzo Maresca.',
    '恩佐·马雷斯卡同意曼城外租蒙加。',
    "Sure there are bound to be bumps but #CFC fans want to watch Chelsea games. Alonso is more popular. My column here: https://www.nytimes.com/athletic/chelsea-transfer-maresca/",
    'Hull City remain in talks to sign Chelsea midfielder Dario Essugo.',
    'Chelsea news: Hull City in talks to sign Dario Essugo on loan',
    'Chelsea have accepted a £3m agreement for David Datro Fofana to join Servette. The striker leaves on a permanent deal.',
    'Tottenham are working on double deal with Chelsea: Mykhailo Mudryk and Tosin Adarabioyo on loan.',
    'Chelsea agree £40m deal for Atalanta defender Ahanor.',
    'Melvine Malard: Chelsea complete signing of Manchester United forward on £750,000 deal',
    'Beever-Jones on signing new Chelsea deal',
    'Enzo Fernandez could make Manchester City significantly better. The football case for selling.',
  ]) assert.equal(classifyChelseaWatch(text), null, text);
});

test('中场引援的否认、被拒绝、其他人选都保留，不靠球员名单封死新目标', () => {
  for (const text of [
    'Chelsea have not made a bid for Adam Wharton.',
    'Chelsea approach for Alex Scott rejected by Bournemouth.',
    'A move to Chelsea for Morgan Gibbs-White has been played down.',
    'Chelsea are in talks for a new midfielder whose identity is not disclosed.',
    "Chelsea's interest in a French midfielder is real, but there is no agreement.",
    '切尔西正在接触新的中场目标，尚未达成协议。',
    'Jordan Henderson joins Chelsea',
  ]) assert.equal(classifyChelseaWatch(text), 'chelsea_incoming', text);
});
