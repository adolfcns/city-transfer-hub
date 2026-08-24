import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('static/index.html', 'utf8');
const css = fs.readFileSync('static/style.css', 'utf8');

test('雾蓝日间版使用低刺激背景、深色正文和曼城天蓝强调', () => {
  assert.match(index, /<meta name="color-scheme" content="light">/);
  assert.match(index, /<meta name="theme-color" content="#eaf3f8">/);
  assert.match(css, /--page:\s*#eaf3f8/);
  assert.match(css, /--surface:\s*#f9fcfe/);
  assert.match(css, /--ink:\s*#18364d/);
  assert.match(css, /--accent:\s*#2b88b8/);
  assert.match(css, /雾蓝日间版 · 长时间阅读舒适配色/);
  assert.match(css, /\.topbar-inner, \.container, \.foot \{ max-width: 1080px; \}/);
  assert.match(css, /\.countdown-value \{[\s\S]*?color:\s*var\(--gold\)/);
});

test('报头接入本地球场横幅并在手机端保持紧凑', () => {
  assert.match(index, /<section class="stadium-hero"/);
  assert.match(index, /<span id="window-countdown"/);
  assert.match(css, /url\("assets\/etihad-night-hero\.webp"\)/);
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*?\.topbar-right \.icon-btn \{[\s\S]*?width:\s*32px;\s*height:\s*32px/);
  assert.match(css, /\.brand-sub \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*?\.topbar \{[\s\S]*?url\("assets\/etihad-night-hero\.webp"\)/);
  assert.match(css, /\.stadium-hero::before \{ display:\s*none; \}/);
  assert.match(css, /\.stadium-countdown-card \{[\s\S]*?width:\s*100%;[\s\S]*?border-radius:\s*0/);
  assert.match(css, /\.stadium-kicker \{ display:\s*block; font-size:\s*12px/);
  assert.equal(fs.existsSync('static/assets/etihad-night-hero.webp'), true);
});

test('舒适浅色主题覆盖消息、调查、评论和移动端卡片', () => {
  assert.match(css, /\.pinned-card, \.card \{[\s\S]*?background:\s*rgba\(255,255,255/);
  assert.match(css, /\.survey-sheet, \.comment-sheet, \.nickname-box, \.modal-box, \.status-panel, \.share-save-panel/);
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*?\.pinned-card, \.card, \.modal-box \{ background:\s*rgba\(255,255,255/);
});
