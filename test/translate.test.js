import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeResponseToMap } from '../scripts/lib/translate.js';

test('Edge translation responses are mapped back to their source order', () => {
  assert.deepEqual(
    edgeResponseToMap([
      { translations: [{ text: '第一条中文' }] },
      { translations: [{ text: '第二条中文' }] },
    ]),
    { 1: '第一条中文', 2: '第二条中文' },
  );
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
