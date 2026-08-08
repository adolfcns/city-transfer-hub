export function buildPagedData(items, metadata, options = {}) {
  const latestCount = Math.max(1, Number(options.latestCount) || 100);
  const focusCount = Math.max(0, Number(options.focusCount) || 30);
  const archiveSize = Math.max(1, Number(options.archiveSize) || 100);
  const initialIds = new Set(items.slice(0, latestCount).map((item) => item.id));
  let includedFocus = 0;
  for (const item of items) {
    if (includedFocus >= focusCount) break;
    if (!Array.isArray(item.focus) || item.focus.length === 0) continue;
    initialIds.add(item.id);
    includedFocus += 1;
  }

  const initialItems = items.filter((item) => initialIds.has(item.id));
  const remaining = items.filter((item) => !initialIds.has(item.id));
  const archiveFiles = [];
  const archives = [];
  for (let offset = 0; offset < remaining.length; offset += archiveSize) {
    const page = archives.length + 1;
    const file = `items-archive-${page}.json`;
    archiveFiles.push(file);
    archives.push({
      file,
      payload: {
        generated_at: metadata.generated_at,
        page,
        items: remaining.slice(offset, offset + archiveSize),
      },
    });
  }

  return {
    latest: {
      ...metadata,
      total_items: items.length,
      archive_files: archiveFiles,
      items: initialItems,
    },
    archives,
  };
}
