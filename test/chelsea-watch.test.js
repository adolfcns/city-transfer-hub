import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  assert.match(app, /只收切尔西引援与恩佐直连曼城动态/);
  assert.match(app, /renderChelseaWatchModule\(zone\);\s*const banner =/);
  assert.match(fetchScript, /writeFile\(resolve\(DATA_DIR, 'chelsea-watch\.json'\)/);
  assert.match(fetchScript, /for \(const source of sources\)[\s\S]*?rawBySource\.get\(source\.key\)/);
  assert.match(workflow, /PREV_CHELSEA_WATCH_URL/);
  assert.match(style, /\.chelsea-watch-grid/);
  assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.chelsea-watch:not\(\.is-open\) \.chelsea-watch-card:nth-child\(n\+2\)/);
});
