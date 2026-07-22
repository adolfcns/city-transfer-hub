// X 信源调度：重点账号每轮抓取，其余账号按时间槽分组轮换。
export function selectTwitterSources(sources, settings = {}, slot = 0) {
  const everyRunKeys = [...new Set(settings.twitter_every_run || [])];
  const everyRunSet = new Set(everyRunKeys);
  const byKey = new Map(sources.map((source) => [source.key, source]));
  const everyRun = everyRunKeys.map((key) => byKey.get(key)).filter(Boolean);
  const rotating = sources.filter((source) => !everyRunSet.has(source.key));
  const groupCount = Math.max(1, Math.floor(Number(settings.twitter_rotation_groups) || 1));
  const groupIndex = ((Math.floor(Number(slot) || 0) % groupCount) + groupCount) % groupCount;
  const selectedRotating = rotating.filter((_, index) => index % groupCount === groupIndex);
  const selectedKeys = new Set([...everyRun, ...selectedRotating].map((source) => source.key));
  return {
    selected: [...everyRun, ...selectedRotating],
    skipped: sources.filter((source) => !selectedKeys.has(source.key)),
    everyRun,
    groupIndex,
    groupCount,
  };
}
