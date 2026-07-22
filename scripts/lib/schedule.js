// X 信源调度：重点等级/账号每轮抓取，其余账号分组交替优先；
// 当前组无冲突时继续补抓另一组，力争每轮全量覆盖。
export function selectTwitterSources(sources, settings = {}, slot = 0) {
  const everyRunTiers = [...new Set(settings.twitter_every_run_tiers || [])];
  const everyRunKeys = [...new Set(settings.twitter_every_run || [])];
  const byKey = new Map(sources.map((source) => [source.key, source]));
  const everyRun = [];
  const everyRunSet = new Set();
  const add = (source) => {
    if (!source || everyRunSet.has(source.key)) return;
    everyRunSet.add(source.key);
    everyRun.push(source);
  };
  for (const tier of everyRunTiers) {
    for (const source of sources) if (source.tier === tier) add(source);
  }
  for (const key of everyRunKeys) add(byKey.get(key));
  const rotating = sources.filter((source) => !everyRunSet.has(source.key));
  const groupCount = Math.max(1, Math.floor(Number(settings.twitter_rotation_groups) || 1));
  const groupIndex = ((Math.floor(Number(slot) || 0) % groupCount) + groupCount) % groupCount;
  const groups = Array.from({ length: groupCount }, () => []);
  rotating.forEach((source, index) => groups[index % groupCount].push(source));
  const due = groups[groupIndex];
  const overflow = groups.flatMap((group, index) => (index === groupIndex ? [] : group));
  return {
    everyRun,
    due,
    overflow,
    groups,
    groupIndex,
    groupCount,
  };
}

export async function runAdaptiveTwitterSchedule(schedule, runOne, pause = async () => {}) {
  const attempted = [];
  const outcomes = [];
  const attempt = async (source) => {
    attempted.push(source);
    const outcome = await runOne(source);
    outcomes.push({ source, outcome });
    await pause();
    return outcome;
  };

  // 必抓信源即便个别失败也继续，确保每个重点账号本轮都实际发出请求。
  for (const source of schedule.everyRun) await attempt(source);

  let conflicted = false;
  for (const source of schedule.due) {
    const outcome = await attempt(source);
    if (outcome?.throttled) { conflicted = true; break; }
  }
  // 当前组没有触发限流时，继续补抓另一组，正常情况下仍是一轮全抓。
  if (!conflicted) {
    for (const source of schedule.overflow) {
      const outcome = await attempt(source);
      if (outcome?.throttled) { conflicted = true; break; }
    }
  }

  const attemptedKeys = new Set(attempted.map((source) => source.key));
  const deferred = [...schedule.due, ...schedule.overflow]
    .filter((source) => !attemptedKeys.has(source.key));
  return { attempted, outcomes, deferred, conflicted };
}
