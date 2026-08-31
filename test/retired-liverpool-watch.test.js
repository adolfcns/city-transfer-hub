import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';

test('利物浦萨尔模块从显示、请求、抓取、翻译及发布中全部撤下', () => {
  for (const file of ['static/app.js', 'static/style.css', 'scripts/fetch.js', '.github/workflows/fetch.yml']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /liverpool.?sarr|sarr-watch|LIVERPOOL_SARR|萨尔追踪/i, file);
  }
  const config = YAML.parse(fs.readFileSync('config/sources.yaml', 'utf8'));
  assert.equal(config.liverpool_sarr_watch_sources, undefined);
  assert.ok(Object.keys(config.settings).every((key) => !key.startsWith('liverpool_sarr')));
  assert.equal(fs.existsSync('scripts/lib/liverpool-sarr-watch.js'), false);
  // 普通曼城新闻中的利物浦/加克波相关内容不全局封杀。
  assert.ok(!(config.content_policy.exclude_players || []).includes('Gakpo'));
});
