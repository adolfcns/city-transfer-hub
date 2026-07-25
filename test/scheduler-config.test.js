import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';

const workflowText = fs.readFileSync('.github/workflows/fetch.yml', 'utf8');
const workflow = YAML.parse(workflowText);
const workerConfig = fs.readFileSync('cloudflare/wrangler.toml', 'utf8');

test('Cloudflare 主定时每 15 分钟运行，GitHub 只做每小时兜底', () => {
  assert.match(workerConfig, /crons\s*=\s*\["\*\/15 \* \* \* \*"\]/);
  assert.deepEqual(workflow.on.schedule, [{ cron: '9 * * * *' }]);
  assert.equal(workflow.concurrency['cancel-in-progress'], true);
});

test('GitHub 小时任务先检查新鲜度，定时抓取不重复部署互动 Worker', () => {
  assert.equal(
    workflow.jobs['fetch-deploy'].if,
    "${{ needs.freshness-check.outputs.should_run == 'true' }}",
  );
  assert.match(workflowText, /age < 25 \* 60 \* 1000/);
  const deployWorker = workflow.jobs['fetch-deploy'].steps
    .find((step) => step.name === 'Deploy Cloudflare Worker');
  const verifyApis = workflow.jobs['fetch-deploy'].steps
    .find((step) => step.name === 'Verify interaction APIs');
  const pushOnly = "${{ github.event_name == 'push' && env.CLOUDFLARE_API_TOKEN != '' }}";
  assert.equal(deployWorker.if, pushOnly);
  assert.equal(verifyApis.if, pushOnly);
});
