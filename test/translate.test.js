import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeResponseToMap, translateNew } from '../scripts/lib/translate.js';

test('Edge translation responses are mapped back to their source order', () => {
  assert.deepEqual(
    edgeResponseToMap([
      { translations: [{ text: '第一条中文' }] },
      { translations: [{ text: '第二条中文' }] },
    ]),
    { 1: '第一条中文', 2: '第二条中文' },
  );
});

test('限时取消翻译不修改已有译文，也不发送新请求', async () => {
  const controller = new AbortController();
  controller.abort();
  const items = [{ text: 'Chelsea target Manu Kone.', text_zh: null }, { text: 'old', text_zh: '已有译文' }];
  const result = await translateNew(items, '', { signal: controller.signal });
  assert.equal(result.remaining, 1);
  assert.equal(result.translated, 0);
  assert.equal(items[1].text_zh, '已有译文');
});

test('invalid or empty Edge translations are ignored', () => {
  assert.deepEqual(
    edgeResponseToMap([
      { translations: [] },
      null,
      { translations: [{ text: '  有效译文  ' }] },
    ]),
    { 3: '有效译文' },
  );
});
