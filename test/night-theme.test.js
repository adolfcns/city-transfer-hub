import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('static/index.html', 'utf8');
const css = fs.readFileSync('static/style.css', 'utf8');

test('伊蒂哈德夜赛版使用深海军蓝、天蓝和金色关窗强调', () => {
  assert.match(index, /<meta name="color-scheme" content="dark">/);
  assert.match(index, /<meta name="theme-color" content="#061b2f">/);
  assert.match(css, /--navy:\s*#061b2f/);
  assert.match(css, /--sky:\s*#39bdf8/);
  assert.match(css, /--gold:\s*#f5c85b/);
  assert.match(css, /伊蒂哈德夜赛版 · 最终视觉覆盖/);
  assert.match(css, /\.topbar-inner, \.container, \.foot \{ max-width: 1080px; \}/);
  assert.match(css, /\.countdown-value \{[\s\S]*?color:\s*var\(--gold\)/);
});

test('报头接入本地球场横幅并在手机端保持紧凑', () => {
  assert.match(index, /<section class="stadium-hero"/);
  assert.match(index, /<span id="window-countdown"/);
  assert.match(css, /url\("assets\/etihad-night-hero\.webp"\)/);
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*?\.topbar-right \.icon-btn \{[\s\S]*?width:\s*32px;\s*height:\s*32px/);
  assert.match(css, /\.brand-sub \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.equal(fs.existsSync('static/assets/etihad-night-hero.webp'), true);
});

test('深色主题覆盖消息、调查、评论和移动端卡片', () => {
  assert.match(css, /\.pinned-card, \.card \{[\s\S]*?linear-gradient/);
  assert.match(css, /\.survey-sheet, \.comment-sheet, \.nickname-box, \.modal-box, \.status-panel, \.share-save-panel/);
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*?\.pinned-card, \.card, \.modal-box/);
});
