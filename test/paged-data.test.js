import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPagedData } from '../scripts/lib/paged-data.js';

test('首次数据包含最新一百条和最多三十条重点传闻，历史包无重复', () => {
  const items = Array.from({ length: 260 }, (_, index) => ({
    id: `item_${index}`,
    focus: index % 5 === 0 ? ['bouaddi'] : undefined,
  }));
  const result = buildPagedData(items, { generated_at: '2026-08-08T00:00:00Z' }, {
    latestCount: 100,
    focusCount: 30,
    archiveSize: 100,
  });
  assert.equal(result.latest.total_items, 260);
  assert.ok(items.slice(0, 100).every((item) => result.latest.items.some((candidate) => candidate.id === item.id)));
  assert.equal(result.latest.items.filter((item) => item.focus?.length).length, 30);
  const reconstructed = [result.latest.items, ...result.archives.map((archive) => archive.payload.items)].flat();
  assert.equal(new Set(reconstructed.map((item) => item.id)).size, 260);
  assert.deepEqual(new Set(reconstructed.map((item) => item.id)), new Set(items.map((item) => item.id)));
  assert.equal(result.archives.length, 2);
});
