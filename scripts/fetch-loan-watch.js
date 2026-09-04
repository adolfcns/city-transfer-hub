import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetch } from 'undici';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CONFIG_PATH = resolve(ROOT, 'config', 'loan-watch-players.json');
const OUTPUT_PATH = resolve(ROOT, 'data', 'loan-watch.json');
const FOTMOB_API = 'https://www.fotmob.com/api/data';
const USER_AGENT = 'Mozilla/5.0 (compatible; CityTransferHub/1.0; +https://adolfcns.github.io/city-transfer-hub/)';
const DATA_VERSION = 2;

const METRIC_KEYS = Object.freeze({
  keeper: [
    ['saves', '扑救'],
    ['goals_prevented', '阻止失球'],
    ['expected_goals_on_target_faced', '预期失球'],
    ['saves_inside_box', '禁区内扑救'],
    ['high_claim', '摘高球'],
    ['accurate_passes', '传球'],
  ],
  defender: [
    ['defensive_actions', '防守贡献'],
    ['recoveries', '夺回球权'],
    ['tackles', '抢断'],
    ['interceptions', '拦截'],
    ['clearances', '解围'],
    ['aerials_won', '争顶'],
  ],
  midfielder: [
    ['expected_assists', '预期助攻'],
    ['chances_created', '创造机会'],
    ['passes_into_final_third', '进入三区'],
    ['accurate_passes', '传球'],
    ['recoveries', '夺回球权'],
    ['ground_duels_won', '地面对抗'],
    ['tackles', '抢断'],
  ],
  attacker: [
    ['expected_goals', '预期进球'],
    ['expected_assists', '预期助攻'],
    ['total_shots', '射门'],
    ['shots_on_target', '射正'],
    ['chances_created', '创造机会'],
    ['dribbles_succeeded', '成功过人'],
    ['touches_opp_box', '禁区触球'],
  ],
});

const KEY_ALIASES = Object.freeze({
  'matchstats.headers.tackles': 'tackles',
  'keeper_saves': 'saves',
  'keeper_goals_conceded': 'goals_conceded',
  'expected_goals_on_target_conceded': 'expected_goals_on_target_faced',
  'ShotsOnTarget': 'shots_on_target',
  'keeper_high_claim': 'high_claim',
});

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function asIso(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function calculateAge(birthDate, at = new Date()) {
  const birth = new Date(birthDate);
  const now = new Date(at);
  if (!Number.isFinite(birth.getTime()) || !Number.isFinite(now.getTime())) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < birth.getUTCMonth()
    || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

export function sameTrackedTeam(match, player) {
  const tracked = new Set((player.team_names || [player.club_en]).map((value) => String(value).trim().toLowerCase()));
  return tracked.has(String(match?.teamName || '').trim().toLowerCase());
}

export function isTrackedAppearance(match, player, seasonStart, now = new Date()) {
  const matchTime = new Date(match?.matchDate?.utcTime || match?.date).getTime();
  const startTime = new Date(player.tracking_from || seasonStart).getTime();
  return Boolean(
    match?.playedInMatch
    && Number(match?.minutesPlayed || 0) > 0
    && Number.isFinite(matchTime)
    && Number.isFinite(startTime)
    && matchTime >= startTime
    && matchTime <= now.getTime() + 6 * 60 * 60 * 1000
    && sameTrackedTeam(match, player)
  );
}

function normalizeStatKey(key) {
  return KEY_ALIASES[key] || key;
}

export function flattenPlayerStats(playerStats) {
  const flattened = {};
  for (const section of playerStats?.stats || []) {
    for (const item of Object.values(section?.stats || {})) {
      if (!item?.key || !item.stat || item.stat.value === undefined) continue;
      const key = normalizeStatKey(item.key);
      flattened[key] = {
        value: item.stat.value,
        ...(item.stat.total === undefined ? {} : { total: item.stat.total }),
        ...(item.stat.type ? { type: item.stat.type } : {}),
      };
    }
  }
  return flattened;
}

function formatMetricValue(stat) {
  if (!stat || stat.value === undefined || stat.value === null) return null;
  if (stat.total !== undefined && stat.total !== null) return `${stat.value}/${stat.total}`;
  if (typeof stat.value === 'number' && !Number.isInteger(stat.value)) return stat.value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return String(stat.value);
}

export function selectPositionMetrics(flattened, positionGroup, limit = 4) {
  const result = [];
  for (const [key, label] of METRIC_KEYS[positionGroup] || METRIC_KEYS.midfielder) {
    const value = formatMetricValue(flattened?.[key]);
    if (value === null) continue;
    result.push({ key, label, value });
    if (result.length >= limit) break;
  }
  return result;
}

function scoreLine(match) {
  const home = Number(match?.homeScore);
  const away = Number(match?.awayScore);
  return Number.isFinite(home) && Number.isFinite(away) ? `${home}-${away}` : '—';
}

function matchOutcome(match) {
  const home = Number(match?.homeScore);
  const away = Number(match?.awayScore);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return '';
  const own = match.isHomeTeam ? home : away;
  const opponent = match.isHomeTeam ? away : home;
  if (own > opponent) return '胜';
  if (own < opponent) return '负';
  return '平';
}

function baseMatch(match) {
  return {
    id: String(match.id),
    date: asIso(match?.matchDate?.utcTime || match?.date),
    competition: match.leagueName || match.competition || '',
    team: match.teamName || match.team || '',
    opponent: match.opponentTeamName || match.opponent || '',
    is_home: Boolean(match.isHomeTeam ?? match.is_home),
    score: scoreLine(match),
    outcome: match.outcome || matchOutcome(match),
    minutes: Number(match.minutesPlayed ?? match.minutes ?? 0),
    goals: Number(match.goals || 0),
    assists: Number(match.assists || 0),
    rating: Number(match?.ratingProps?.rating ?? match.rating ?? 0) || null,
    appearance_status: match.playedInMatch
      ? (match.lineupPositionId === undefined || match.lineupPositionId === null ? 'subbed_on' : 'starter')
      : (match.onBench ? 'unused_sub' : (match.appearance_status || null)),
    url: match.matchPageUrl
      ? `https://www.fotmob.com${match.matchPageUrl}`
      : (match.url || `https://www.fotmob.com/matches/x#${match.id}`),
  };
}

export function lineupAppearanceStatus(details, player) {
  const lineup = details?.content?.lineup;
  if (!lineup) return null;
  const team = [lineup.homeTeam, lineup.awayTeam].find((item) => Number(item?.id) === Number(player.fotmob_team_id));
  if (!team || !Array.isArray(team.starters) || !Array.isArray(team.subs)) return null;
  if (team.starters.some((item) => Number(item?.id) === Number(player.fotmob_id))) return 'starter';
  const substitute = team.subs.find((item) => Number(item?.id) === Number(player.fotmob_id));
  if (!substitute) return 'not_in_squad';
  const stats = details?.content?.playerStats?.[String(player.fotmob_id)];
  const flattened = stats ? flattenPlayerStats(stats) : {};
  const minutes = Number(flattened.minutes_played?.value || 0);
  const cameOn = (substitute?.performance?.substitutionEvents || []).some((event) => event?.type === 'subIn');
  return minutes > 0 || cameOn ? 'subbed_on' : 'unused_sub';
}

export function summarizeMatches(matches) {
  const played = matches.filter((match) => Number(match.minutes || 0) > 0);
  const ratings = played.map((match) => Number(match.rating)).filter((value) => value > 0);
  const average = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null;
  return {
    appearances: played.length,
    minutes: played.reduce((sum, match) => sum + Number(match.minutes || 0), 0),
    goals: played.reduce((sum, match) => sum + Number(match.goals || 0), 0),
    assists: played.reduce((sum, match) => sum + Number(match.assists || 0), 0),
    average_rating: average === null ? null : Number(average.toFixed(2)),
  };
}

async function fetchJson(url, { attempts = 3, timeoutMs = 18000, beforeAttempt = null } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (beforeAttempt) beforeAttempt();
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(attempt * 700);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('request failed');
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function loadPrevious() {
  const remote = process.env.PREV_LOAN_WATCH_URL;
  if (remote) {
    try {
      return await fetchJson(`${remote}${remote.includes('?') ? '&' : '?'}t=${Date.now()}`, { attempts: 2, timeoutMs: 12000 });
    } catch (error) {
      console.warn(`Previous loan-watch snapshot unavailable: ${error.message}`);
    }
  }
  return readJsonFile(OUTPUT_PATH);
}

function previousMatchMap(previousPlayer) {
  return new Map((previousPlayer?.matches || []).map((match) => [String(match.id), match]));
}

function playerFallback(configPlayer, previousPlayer, now, error = null) {
  const matches = [...(previousPlayer?.matches || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return {
    key: configPlayer.key,
    fotmob_id: configPlayer.fotmob_id,
    fotmob_team_id: configPlayer.fotmob_team_id,
    team_names: [...(configPlayer.team_names || [configPlayer.club_en])],
    name_zh: configPlayer.name_zh,
    name_en: configPlayer.name_en,
    club_zh: configPlayer.club_zh,
    club_en: configPlayer.club_en,
    position_zh: configPlayer.position_zh,
    position_group: configPlayer.position_group,
    status: configPlayer.status,
    priority: Boolean(configPlayer.priority),
    ...(configPlayer.fan_pick ? { fan_pick: true } : {}),
    ...(configPlayer.relation_zh ? { relation_zh: configPlayer.relation_zh } : {}),
    birth_date: previousPlayer?.birth_date || null,
    age: previousPlayer?.birth_date ? calculateAge(previousPlayer.birth_date, now) : (previousPlayer?.age ?? null),
    summary: summarizeMatches(matches),
    matches,
    schedule: [...(previousPlayer?.schedule || [])],
    next_match: previousPlayer?.next_match || null,
    ...(error ? { last_error: error } : {}),
  };
}

async function buildPlayer(configPlayer, previousPlayer, config, now, matchDetailsCache, budget = null) {
  let profile;
  try {
    profile = budget
      ? await fetchFotmob(`playerData?id=${encodeURIComponent(configPlayer.fotmob_id)}`, budget)
      : await fetchJson(`${FOTMOB_API}/playerData?id=${encodeURIComponent(configPlayer.fotmob_id)}`);
  } catch (error) {
    return playerFallback(configPlayer, previousPlayer, now, error.message);
  }

  const priorMatches = previousMatchMap(previousPlayer);
  const currentMatches = (profile.recentMatches || [])
    .filter((match) => isTrackedAppearance(match, configPlayer, config.season_start, now))
    .map(baseMatch);
  const allMatches = new Map(priorMatches);
  for (const match of currentMatches) {
    allMatches.set(match.id, { ...(priorMatches.get(match.id) || {}), ...match });
  }

  const matches = [...allMatches.values()]
    .filter((match) => {
      const time = new Date(match.date).getTime();
      return Number.isFinite(time) && time >= new Date(configPlayer.tracking_from || config.season_start).getTime();
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 60);

  for (const match of matches) {
    if (match.details_loaded) continue;
    try {
      let detailsPromise = matchDetailsCache.get(match.id);
      if (!detailsPromise) {
        detailsPromise = budget
          ? fetchFotmob(`matchDetails?matchId=${encodeURIComponent(match.id)}`, budget)
          : fetchJson(`${FOTMOB_API}/matchDetails?matchId=${encodeURIComponent(match.id)}`);
        matchDetailsCache.set(match.id, detailsPromise);
      }
      const details = await detailsPromise;
      const stats = details?.content?.playerStats?.[String(configPlayer.fotmob_id)];
      if (!stats) continue;
      const flattened = flattenPlayerStats(stats);
      match.metrics = selectPositionMetrics(flattened, configPlayer.position_group);
      match.details_loaded = true;
      match.appearance_status = lineupAppearanceStatus(details, configPlayer) || match.appearance_status || 'played';
      match.rating = Number(flattened.rating_title?.value ?? match.rating) || null;
      match.minutes = Number(flattened.minutes_played?.value ?? match.minutes ?? 0);
      match.goals = Number(flattened.goals?.value ?? match.goals ?? 0);
      match.assists = Number(flattened.assists?.value ?? match.assists ?? 0);
    } catch (error) {
      match.details_error = error.message;
    }
  }

  const birthDate = asIso(profile?.birthDate?.utcTime) || previousPlayer?.birth_date || null;
  return {
    key: configPlayer.key,
    fotmob_id: configPlayer.fotmob_id,
    fotmob_team_id: configPlayer.fotmob_team_id,
    team_names: [...(configPlayer.team_names || [configPlayer.club_en])],
    name_zh: configPlayer.name_zh,
    name_en: configPlayer.name_en,
    club_zh: configPlayer.club_zh,
    club_en: configPlayer.club_en,
    position_zh: configPlayer.position_zh,
    position_group: configPlayer.position_group,
    status: configPlayer.status,
    priority: Boolean(configPlayer.priority),
    ...(configPlayer.fan_pick ? { fan_pick: true } : {}),
    ...(configPlayer.relation_zh ? { relation_zh: configPlayer.relation_zh } : {}),
    birth_date: birthDate,
    age: birthDate ? calculateAge(birthDate, now) : null,
    summary: summarizeMatches(matches),
    matches,
  };
}

function createProviderBudget(previous, config, now) {
  const date = now.toISOString().slice(0, 10);
  const prior = previous?.provider_usage;
  return {
    date,
    requests: prior?.date === date ? Number(prior.requests || 0) : 0,
    limit: Number(config.provider_daily_limit || 95),
  };
}

async function fetchFotmob(path, budget, options = {}) {
  return fetchJson(`${FOTMOB_API}/${path}`, {
    attempts: 2,
    timeoutMs: 18000,
    ...options,
    beforeAttempt: () => {
      if (budget.requests >= budget.limit) throw new Error('fotmob_daily_budget_reached');
      budget.requests += 1;
    },
  });
}

function fixtureRows(teamData) {
  return teamData?.fixtures?.allFixtures?.fixtures || teamData?.fixtures?.fixtures || [];
}

function scheduledFixture(fixture, player, config, previousSchedule = null) {
  const date = asIso(fixture?.status?.utcTime);
  if (!date) return null;
  const homeId = Number(fixture?.home?.id);
  const awayId = Number(fixture?.away?.id);
  const isHome = homeId === Number(player.fotmob_team_id);
  if (!isHome && awayId !== Number(player.fotmob_team_id)) return null;
  const matchDurationMs = Number(config.estimated_match_duration_hours || 2) * 60 * 60 * 1000;
  const delayMs = Number(config.post_match_fetch_delay_hours || 1) * 60 * 60 * 1000;
  return {
    id: String(fixture.id),
    date,
    opponent: fixture?.opponent?.name || (isHome ? fixture?.away?.name : fixture?.home?.name) || '',
    competition: fixture?.tournament?.name || '',
    is_home: isHome,
    url: fixture.pageUrl ? `https://www.fotmob.com${fixture.pageUrl}` : `https://www.fotmob.com/matches/x#${fixture.id}`,
    fetch_after: previousSchedule?.fetch_after || new Date(new Date(date).getTime() + matchDurationMs + delayMs).toISOString(),
    checked: Boolean(previousSchedule?.checked),
    checked_at: previousSchedule?.checked_at || null,
  };
}

export function matchFromDetails(details, schedule, player) {
  const appearanceStatus = lineupAppearanceStatus(details, player);
  if (!appearanceStatus) return null;
  const playerStats = details?.content?.playerStats?.[String(player.fotmob_id)];
  const flattened = playerStats ? flattenPlayerStats(playerStats) : {};
  const minutes = Number(flattened.minutes_played?.value || 0);
  const teams = details?.header?.teams || [];
  const home = teams[0] || {};
  const away = teams[1] || {};
  // 未登场球员不会出现在 playerStats 中，主客场应由球队 id 判断。
  const isHome = Number(player.fotmob_team_id) === Number(home.id);
  const homeScore = Number(home.score);
  const awayScore = Number(away.score);
  const matchLike = { homeScore, awayScore, isHomeTeam: isHome };
  return {
    id: String(schedule.id),
    date: asIso(details?.general?.matchTimeUTCDate || schedule.date),
    competition: details?.general?.leagueName || schedule.competition || '',
    team: player.club_en,
    opponent: isHome ? away.name : home.name,
    is_home: isHome,
    score: Number.isFinite(homeScore) && Number.isFinite(awayScore) ? `${homeScore}-${awayScore}` : '—',
    outcome: matchOutcome(matchLike),
    minutes,
    goals: Number(flattened.goals?.value || 0),
    assists: Number(flattened.assists?.value || 0),
    rating: Number(flattened.rating_title?.value || 0) || null,
    appearance_status: appearanceStatus,
    url: schedule.url,
    metrics: minutes > 0 ? selectPositionMetrics(flattened, player.position_group) : [],
    details_loaded: true,
  };
}

function configuredPlayer(configPlayer, previousPlayer, now) {
  const matches = [...(previousPlayer?.matches || [])]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 60);
  return {
    key: configPlayer.key,
    fotmob_id: configPlayer.fotmob_id,
    fotmob_team_id: configPlayer.fotmob_team_id,
    team_names: [...(configPlayer.team_names || [configPlayer.club_en])],
    name_zh: configPlayer.name_zh,
    name_en: configPlayer.name_en,
    club_zh: configPlayer.club_zh,
    club_en: configPlayer.club_en,
    position_zh: configPlayer.position_zh,
    position_group: configPlayer.position_group,
    status: configPlayer.status,
    priority: Boolean(configPlayer.priority),
    ...(configPlayer.fan_pick ? { fan_pick: true } : {}),
    ...(configPlayer.relation_zh ? { relation_zh: configPlayer.relation_zh } : {}),
    birth_date: configPlayer.birth_date || previousPlayer?.birth_date || null,
    age: calculateAge(configPlayer.birth_date || previousPlayer?.birth_date, now),
    summary: summarizeMatches(matches),
    matches,
    schedule: [...(previousPlayer?.schedule || [])],
  };
}

export async function buildLoanWatchData({ now = new Date(), force = false } = {}) {
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const previous = await loadPrevious();
  const previousPlayers = new Map((previous?.players || []).map((player) => [player.key, player]));
  const configPlayers = [
    ...(config.players || []).map((player) => ({ ...player, fan_pick: false })),
    ...(config.fan_picks || []).map((player) => ({ ...player, fan_pick: true })),
  ];
  let players = configPlayers.map((player) => configuredPlayer(player, previousPlayers.get(player.key), now));
  const budget = createProviderBudget(previous, config, now);
  const matchDetailsCache = new Map();

  // 旧快照升级时，用球员近期比赛中的 onBench 字段补齐既有出场的首发/替补身份；每名球员只需一次请求。
  if (Number(previous?.version || 1) < DATA_VERSION) {
    await mapLimit(players, 2, async (player, index) => {
      try {
        const profile = await fetchFotmob(`playerData?id=${encodeURIComponent(player.fotmob_id)}`, budget);
        const recent = new Map((profile?.recentMatches || []).map((match) => [String(match.id), match]));
        const matches = new Map((player.matches || []).map((match) => [String(match.id), match]));
        for (const source of profile?.recentMatches || []) {
          const time = new Date(source?.matchDate?.utcTime || source?.date).getTime();
          const start = new Date(configPlayers[index]?.tracking_from || config.season_start).getTime();
          if (!sameTrackedTeam(source, configPlayers[index]) || !Number.isFinite(time) || time < start || time > now.getTime()) continue;
          if (!source.playedInMatch && source.onBench && !matches.has(String(source.id))) {
            matches.set(String(source.id), { ...baseMatch(source), details_loaded: true });
          }
        }
        player.matches = [...matches.values()].map((match) => {
          if (match.appearance_status) return match;
          const source = recent.get(String(match.id));
          if (!source?.playedInMatch) return { ...match, appearance_status: 'played' };
          return {
            ...match,
            appearance_status: source.lineupPositionId === undefined || source.lineupPositionId === null ? 'subbed_on' : 'starter',
          };
        }).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 60);
      } catch {
        player.matches = (player.matches || []).map((match) => ({ ...match, appearance_status: match.appearance_status || 'played' }));
      }
      const configPlayer = configPlayers[index];
      player.summary = summarizeMatches(player.matches);
      if (!player.birth_date && configPlayer?.birth_date) {
        player.birth_date = configPlayer.birth_date;
        player.age = calculateAge(configPlayer.birth_date, now);
      }
    });
  }

  // 新增的“球迷点将”无需等下一场比赛：首次入选时补齐本赛季已有出场，之后仍按赛程逐场更新。
  await mapLimit(players, 2, async (player, index) => {
    if (previousPlayers.has(player.key)) return;
    const hydrated = await buildPlayer(configPlayers[index], null, config, now, matchDetailsCache, budget);
    players[index] = { ...player, ...hydrated, schedule: player.schedule || [] };
  });
  const refreshMs = Number(config.schedule_refresh_hours || 24) * 60 * 60 * 1000;
  const scheduleAge = now.getTime() - new Date(previous?.schedule_updated_at || 0).getTime();
  const refreshSchedule = force || !Number.isFinite(scheduleAge) || scheduleAge >= refreshMs || previous?.players?.length !== players.length;
  let scheduleUpdatedAt = previous?.schedule_updated_at || null;

  if (refreshSchedule) {
    await mapLimit(players, 4, async (player, index) => {
      const configPlayer = configPlayers[index];
      const priorSchedule = new Map((player.schedule || []).map((fixture) => [String(fixture.id), fixture]));
      const playedIds = new Set((player.matches || []).map((match) => String(match.id)));
      try {
        const teamData = await fetchFotmob(`teams?id=${encodeURIComponent(configPlayer.fotmob_team_id)}`, budget);
        player.schedule = fixtureRows(teamData)
          .map((fixture) => scheduledFixture(fixture, configPlayer, config, priorSchedule.get(String(fixture.id))))
          .filter(Boolean)
          .filter((fixture) => {
            const time = new Date(fixture.date).getTime();
            if (playedIds.has(fixture.id)) return false;
            if (time < new Date(config.season_start).getTime()) return false;
            // 首次建立赛程时不回扫已经过去且此前未记录的比赛，避免浪费每日额度。
            if (time <= now.getTime() && !priorSchedule.has(fixture.id)) return false;
            return time <= now.getTime() + 210 * 86400 * 1000;
          })
          .sort((a, b) => String(a.date).localeCompare(String(b.date)))
          .slice(0, 12);
      } catch (error) {
        player.schedule_error = error.message;
      }
    });
    scheduleUpdatedAt = now.toISOString();
  }

  const dueMatches = new Map();
  for (const player of players) {
    const recordedIds = new Set((player.matches || []).map((match) => String(match.id)));
    for (const fixture of player.schedule || []) {
      // 旧版本可能先把赛程标为 checked，随后在处理未登场球员时出错。
      // 自动重新开放这类“已检查但没有逐场记录”的赛程，下一轮即可补抓。
      if (fixture.checked && !recordedIds.has(String(fixture.id))) {
        fixture.checked = false;
        fixture.checked_at = null;
        fixture.fetch_after = now.toISOString();
      }
      const scheduledRetryAt = new Date(fixture.date).getTime()
        + (Number(config.estimated_match_duration_hours || 2) + Number(config.post_match_fetch_delay_hours || 1)) * 60 * 60 * 1000;
      if (!fixture.checked && !recordedIds.has(String(fixture.id)) && scheduledRetryAt <= now.getTime()) {
        fixture.fetch_after = now.toISOString();
      }
      if (fixture.checked || new Date(fixture.fetch_after).getTime() > now.getTime()) continue;
      if (!dueMatches.has(fixture.id)) dueMatches.set(fixture.id, []);
      dueMatches.get(fixture.id).push({ player, fixture });
    }
  }

  await mapLimit([...dueMatches.entries()], 3, async ([matchId, entries]) => {
    try {
      const details = await fetchFotmob(`matchDetails?matchId=${encodeURIComponent(matchId)}`, budget);
      const finished = Boolean(details?.general?.finished || details?.header?.status?.finished);
      if (!finished) {
        for (const { fixture } of entries) fixture.fetch_after = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
        return;
      }
      for (const { player, fixture } of entries) {
        const match = matchFromDetails(details, fixture, player);
        if (!match) {
          fixture.fetch_after = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
          continue;
        }
        fixture.checked = true;
        fixture.checked_at = now.toISOString();
        const matches = new Map((player.matches || []).map((item) => [String(item.id), item]));
        matches.set(match.id, match);
        player.matches = [...matches.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 60);
        player.summary = summarizeMatches(player.matches);
      }
    } catch (error) {
      for (const { fixture } of entries) {
        fixture.checked = false;
        fixture.last_error = error.message;
        fixture.fetch_after = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      }
    }
  });

  for (const player of players) {
    player.next_match = (player.schedule || []).find((fixture) => !fixture.checked && new Date(fixture.date).getTime() > now.getTime()) || null;
  }
  const available = players.filter((player) => !player.schedule_error).length;
  return {
    version: DATA_VERSION,
    generated_at: now.toISOString(),
    checked_at: now.toISOString(),
    season_start: config.season_start,
    schedule_updated_at: scheduleUpdatedAt,
    schedule_refresh_hours: Number(config.schedule_refresh_hours || 24),
    estimated_match_duration_hours: Number(config.estimated_match_duration_hours || 2),
    post_match_fetch_delay_hours: Number(config.post_match_fetch_delay_hours || 1),
    provider_usage: budget,
    provider: {
      name: 'FotMob',
      url: 'https://www.fotmob.com',
      note: '每天刷新一次赛程；预计完赛一小时后抓取评分与比赛数据。免费数据源可能存在延迟，以赛事官方记录为准。',
    },
    priority_count: players.filter((player) => player.priority && !player.fan_pick).length,
    fan_pick_count: players.filter((player) => player.fan_pick).length,
    total: players.filter((player) => !player.fan_pick).length,
    available,
    players,
  };
}

async function main() {
  const force = process.argv.includes('--force') || process.env.FORCE_LOAN_WATCH === '1';
  const data = await buildLoanWatchData({ force });
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  const appearances = data.players.reduce((sum, player) => sum + Number(player.summary?.appearances || 0), 0);
  console.log(`Loan watch ready: ${data.total} players, ${data.priority_count} priority, ${appearances} tracked appearances${data.reused_snapshot ? ' (snapshot reused)' : ''}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(async (error) => {
    console.error(`Loan watch update failed: ${error.stack || error.message}`);
    const config = await readJsonFile(CONFIG_PATH);
    if (config?.players?.length) {
      const previous = await loadPrevious();
      const now = new Date();
      const configPlayers = [
        ...(config.players || []).map((player) => ({ ...player, fan_pick: false })),
        ...(config.fan_picks || []).map((player) => ({ ...player, fan_pick: true })),
      ];
      const fallback = {
        version: Number(previous?.version || 1),
        generated_at: previous?.generated_at || now.toISOString(),
        checked_at: now.toISOString(),
        season_start: config.season_start,
        schedule_updated_at: previous?.schedule_updated_at || null,
        schedule_refresh_hours: Number(config.schedule_refresh_hours || 24),
        estimated_match_duration_hours: Number(config.estimated_match_duration_hours || 2),
        post_match_fetch_delay_hours: Number(config.post_match_fetch_delay_hours || 1),
        provider_usage: previous?.provider_usage || {
          date: now.toISOString().slice(0, 10),
          requests: 0,
          limit: Number(config.provider_daily_limit || 95),
        },
        provider: previous?.provider || {
          name: 'FotMob',
          url: 'https://www.fotmob.com',
          note: '赛后评分及比赛数据来自 FotMob；免费数据源可能存在延迟，以赛事官方记录为准。',
        },
        priority_count: config.players.filter((player) => player.priority).length,
        fan_pick_count: (config.fan_picks || []).length,
        total: config.players.length,
        available: Number(previous?.available || 0),
        stale: true,
        players: configPlayers.map((player) => playerFallback(
          player,
          previous?.players?.find((item) => item.key === player.key),
          now,
          error.message,
        )),
      };
      await mkdir(dirname(OUTPUT_PATH), { recursive: true });
      await writeFile(OUTPUT_PATH, `${JSON.stringify(fallback, null, 2)}\n`, 'utf8');
      console.warn('Kept the previous loan-watch snapshot; transfer-news fetching remains unaffected.');
      return;
    }
    process.exitCode = 1;
  });
}
