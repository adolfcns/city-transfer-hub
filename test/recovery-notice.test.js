import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('static/index.html', 'utf8');
const app = fs.readFileSync('static/app.js', 'utf8');

test('故障恢复公告包含简要说明和站长邮箱', () => {
  assert.match(html, /网站已恢复更新/);
  assert.match(html, /昨天网站因网络原因出现短暂更新异常，目前已经修复并恢复正常/);
  assert.match(html, /mailto:shiqie7272@163\.com/);
});

test('故障恢复公告在每台设备关闭后不再重复弹出', () => {
  assert.match(app, /cth_recovery_notice_20260807/);
  assert.match(app, /localStorage\.setItem\(RECOVERY_NOTICE_KEY, 'dismissed'\)/);
  assert.match(app, /localStorage\.getItem\(RECOVERY_NOTICE_KEY\) === 'dismissed'/);
  assert.match(app, /showRecoveryNotice\(\);/);
});
