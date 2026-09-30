import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';

const workflowText = fs.readFileSync('.github/workflows/fetch.yml', 'utf8');
const workflow = YAML.parse(workflowText);
const watchdogText = fs.readFileSync('.github/workflows/social-watchdog.yml', 'utf8');
const watchdog = YAML.parse(watchdogText);
const workerConfig = fs.readFileSync('cloudflare/wrangler.toml', 'utf8');

test('高频争取计划触发机会，但只在北京时间傍晚到次日早间抓取', () => {
  assert.match(workerConfig, /crons\s*=\s*\[\]/);
  assert.deepEqual(workflow.on.schedule, [{ cron: '*/15 * * * *' }]);
  assert.match(workflowText, /TZ=Asia\/Shanghai date \+%H/);
  assert.match(workflowText, /"\$BEIJING_HOUR" -ge 9/);
  assert.match(workflowText, /"\$BEIJING_HOUR" -le 16/);
  assert.equal(workflow.concurrency['cancel-in-progress'], true);
});

test('独立看门狗在社媒过期时调用主抓取工作流', () => {
  assert.deepEqual(watchdog.on.schedule, [{ cron: '7,22,37,52 * * * *' }]);
  assert.equal(watchdog.permissions.actions, 'write');
  assert.match(watchdogText, /data\.last_success/);
  assert.match(watchdogText, /50 \* 60 \* 1000/);
  assert.match(watchdogText, /actions\/workflows\/fetch\.yml\/dispatches/);
  assert.match(watchdogText, /TZ=Asia\/Shanghai date \+%H/);
});

test('GitHub 小时任务同时检查外租、社媒与一线队复盘新鲜度，定时抓取不重复部署互动 Worker', () => {
  assert.equal(
    workflow.jobs['fetch-deploy'].if,
    "${{ needs.freshness-check.outputs.should_run == 'true' }}",
  );
  assert.match(workflowText, /maxAge: 90 \* 60 \* 1000/);
  assert.match(workflowText, /maxAge: 50 \* 60 \* 1000/);
  assert.match(workflowText, /Update loan schedule and post-match data/);
  assert.match(workflowText, /First-team analysis.+maxAge: 50 \* 60 \* 1000/);
  assert.match(workflowText, /Update first-team post-match analysis/);
  assert.match(workflowText, /node scripts\/fetch-first-team-analysis\.js/);
  assert.match(workflowText, /Update the ten-source social feed/);
  assert.doesNotMatch(workflowText, /Fetch all sources|node scripts\/fetch\.js/);
  const deployWorker = workflow.jobs['fetch-deploy'].steps
    .find((step) => step.name === 'Deploy Cloudflare Worker');
  const verifyApis = workflow.jobs['fetch-deploy'].steps
    .find((step) => step.name === 'Verify interaction APIs');
  const pushOnlyAfterMirror = "${{ github.event_name == 'push' && env.CLOUDFLARE_API_TOKEN != '' && steps.mirror.outcome == 'success' }}";
  assert.equal(deployWorker.if, pushOnlyAfterMirror);
  assert.equal(verifyApis.if, pushOnlyAfterMirror);
});

test('两条发布路径互相独立并各自重试临时故障', () => {
  const steps = workflow.jobs['fetch-deploy'].steps.map((step) => step.name);
  assert.ok(
    steps.indexOf('Deploy to GitHub Pages') < steps.indexOf('Mirror to Cloudflare Pages'),
  );
  const deployPages = workflow.jobs['fetch-deploy'].steps
    .find((step) => step.name === 'Deploy to GitHub Pages');
  const retryPages = workflow.jobs['fetch-deploy'].steps
    .find((step) => step.name === 'Retry GitHub Pages deployment');
  const mirror = workflow.jobs['fetch-deploy'].steps
    .find((step) => step.name === 'Mirror to Cloudflare Pages');
  assert.equal(deployPages['continue-on-error'], true);
  assert.equal(deployPages.env.NODE_OPTIONS, '--use-system-ca');
  assert.equal(retryPages.if, "${{ steps.deployment.outcome == 'failure' }}");
  assert.equal(retryPages['continue-on-error'], true);
  assert.equal(mirror.if, "${{ always() && steps.assemble.outcome == 'success' && env.CLOUDFLARE_API_TOKEN != '' }}");
  assert.match(workflowText, /for attempt in 1 2 3/);
  assert.match(workflowText, /GitHub Pages 首次发布和自动重试均失败；Cloudflare 备用站已独立尝试更新/);
});
