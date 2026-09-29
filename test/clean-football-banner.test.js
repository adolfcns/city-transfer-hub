import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('static/index.html', 'utf8');
const css = fs.readFileSync('static/style.css', 'utf8');

test('社媒首页入口上方提供纯净看球条幅', () => {
  const bannerAt = html.indexOf('class="clean-football-banner"');
  const gridAt = html.indexOf('class="feature-hero-grid"');
  assert.ok(bannerAt > 0 && bannerAt < gridAt);
  assert.match(html, /少看戾气，回到足球/);
  assert.match(html, /懂球帝圈子里针对曼城球迷的辱骂和挑衅明显多了/);
  assert.match(html, /安静看曼城消息，认真聊比赛/);
});

test('条幅加入后压缩电脑和手机的四个入口', () => {
  assert.match(css, /\.clean-football-banner\s*\{/);
  assert.match(css, /\.loan-page-hero-link\s*\{\s*min-height:\s*74px/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.loan-page-hero-link\s*\{\s*min-height:\s*68px/);
  assert.match(css, /\.clean-football-banner p\s*\{[\s\S]*?display:\s*block/);
});
