import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('static/app.js', 'utf8');
const pagesWorker = fs.readFileSync('cloudflare/pages-worker.js', 'utf8');
const triggerWorker = fs.readFileSync('scripts/cloudflare-worker.js', 'utf8');
const routes = JSON.parse(fs.readFileSync('cloudflare/pages-routes.json', 'utf8'));
const statsWorkflow = fs.readFileSync('.github/workflows/share-stats.yml', 'utf8');

test('离队投票分享动作只写入隐藏后台且保留来源归因', () => {
  assert.match(app, /const SHARE_ATTRIBUTION_KEY = 'departure_poll_share'/);
  assert.match(app, /surveyShareUrl\(context\.pollId, SHARE_ATTRIBUTION_KEY\)/);
  assert.match(app, /recordShareEvent\('native_share', context\.pollId\)/);
  assert.match(app, /recordShareEvent\('copy_link', context\.pollId\)/);
  assert.match(app, /onDownload: \(\) => recordShareEvent\('save_image', context\.pollId\)/);
  assert.match(app, /recordShareEvent\('shared_visit', DEPARTURE_SURVEY_ID\)/);
  assert.match(app, /keepalive: true/);
  assert.match(app, /recordRequestedShareVisit\(\);/);
  assert.doesNotMatch(app, /分享人数|后台分享统计/);
});

test('分享接口仅允许写入并以事件编号去重', () => {
  for (const worker of [pagesWorker, triggerWorker]) {
    assert.match(worker, /CREATE TABLE IF NOT EXISTS share_events/);
    assert.match(worker, /event_id TEXT PRIMARY KEY/);
    assert.match(worker, /INSERT OR IGNORE INTO share_events/);
    assert.match(worker, /\['native_share', 'copy_link', 'save_image', 'shared_visit'\]/);
    assert.match(worker, /\/share-events/);
    assert.match(worker, /request\.method !== 'POST'/);
  }
  assert.ok(routes.include.includes('/share-events'));
});

test('站长统计通过手动后台任务查询且不提供网页查询接口', () => {
  assert.match(statsWorkflow, /workflow_dispatch/);
  assert.match(statsWorkflow, /wrangler@4 d1 execute city-reactions --remote --json/);
  assert.match(statsWorkflow, /COUNT\(DISTINCT voter_id\)/);
  assert.match(statsWorkflow, /近24小时/);
});
