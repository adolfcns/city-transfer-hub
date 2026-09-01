import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('static/app.js', 'utf8');
const style = fs.readFileSync('static/style.css', 'utf8');
const pagesWorker = fs.readFileSync('cloudflare/pages-worker.js', 'utf8');
const triggerWorker = fs.readFileSync('scripts/cloudflare-worker.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/fetch.yml', 'utf8');
const routes = JSON.parse(fs.readFileSync('cloudflare/pages-routes.json', 'utf8'));

test('新赛季鼓励按钮使用独立计数并把数字紧跟在蓝心后', () => {
  assert.match(app, /season-blessing-action-count', '💙 —'/);
  assert.match(app, /actionCount\.textContent = `💙 \$\{/);
  assert.match(app, /SEASON_BLESSING_ENDPOINTS/);
  assert.doesNotMatch(app, /prayer\.click\(\)/);
  assert.match(style, /\.season-blessing-action-count[^}]*margin-left: 5px/);
});

test('两条 Cloudflare 路径都用独立数据行，发布检查只读取不增加', () => {
  for (const worker of [pagesWorker, triggerWorker]) {
    assert.match(worker, /SEASON_BLESSING_COUNTER_KEY = 'season_blessing_2026'/);
    assert.match(worker, /CREATE TABLE IF NOT EXISTS site_counters/);
    assert.match(worker, /season-blessing-limit\.internal/);
    assert.match(worker, /incrementSiteCounter\(env, SEASON_BLESSING_COUNTER_KEY\)/);
  }
  assert.ok(routes.include.includes('/season-blessing'));
  assert.match(workflow, /fetch\(seasonBlessingUrl, \{ headers: \{ Origin: origin \} \}\)/);
  assert.doesNotMatch(workflow, /fetch\(seasonBlessingUrl, \{[\s\S]{0,100}method: 'POST'/);
});
