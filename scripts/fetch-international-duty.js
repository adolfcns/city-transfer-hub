import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'international-duty.json');
const OUTPUT_PATH = path.join(ROOT, 'data', 'international-duty.json');
const FOTMOB_API = 'https://www.fotmob.com/api/data';
const USER_AGENT = 'Mozilla/5.0 (compatible; CityTransferHub/1.0)';
const POST_MATCH_DELAY_MS = 3 * 60 * 60 * 1000;
const RETRY_INTERVAL_MS = 6 * 60 * 60 * 1000;

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function flattenPlayerStats(playerStats) {
  const result = {};
  for (const section of playerStats?.stats || []) {
    for (const item of Object.values(section?.stats || {})) {
      if (!item?.key || item?.stat?.value === undefined) continue;
      result[item.key] = item.stat.value;
    }
  }
  return result;
}

function matchesPlayer(lineupPlayer, player) {
  const value = normalizeName(lineupPlayer?.name || lineupPlayer?.fullName);
  return [player.name_en, ...(player.aliases || [])].some((alias) => normalizeName(alias) === value);
}

function playerAppearance(details, teamConfig, player) {
  const lineup = details?.content?.lineup;
  const team = [lineup?.homeTeam, lineup?.awayTeam]
    .find((item) => normalizeName(item?.name) === normalizeName(teamConfig.name_en));
  if (!team) return { name: player.name, name_en: player.name_en, status: '待补录', minutes: null };

  const starter = (team.starters || []).find((item) => matchesPlayer(item, player));
  const substitute = (team.subs || []).find((item) => matchesPlayer(item, player));
  const squadPlayer = starter || substitute;
  if (!squadPlayer) return { name: player.name, name_en: player.name_en, status: '未进名单', minutes: 0 };

  const flattened = flattenPlayerStats(details?.content?.playerStats?.[String(squadPlayer.id)]);
  const minutesValue = Number(flattened.minutes_played);
  const events = squadPlayer?.performance?.substitutionEvents || [];
  const cameOn = events.some((event) => event?.type === 'subIn');
  const subOut = events.find((event) => event?.type === 'subOut');
  const subIn = events.find((event) => event?.type === 'subIn');
  const fallbackMinutes = starter
    ? (Number.isFinite(Number(subOut?.time)) ? Number(subOut.time) : 90)
    : (cameOn && Number.isFinite(Number(subIn?.time)) ? Math.max(0, 90 - Number(subIn.time)) : 0);
  const minutes = Number.isFinite(minutesValue) ? Math.max(0, Math.round(minutesValue)) : fallbackMinutes;
  const status = starter ? '首发' : (minutes > 0 || cameOn ? '替补登场' : '替补未登场');
  return { name: player.name, name_en: player.name_en, status, minutes };
}

function configClubs(config) {
  if (Array.isArray(config?.clubs)) return config.clubs;
  if (Array.isArray(config?.teams)) {
    return [{ key: 'city', name: '曼城', name_en: 'Manchester City', badge: '🔵', teams: config.teams }];
  }
  return [];
}

function fixtureStableKey(fixture) {
  return String(fixture?.match_key || fixture?.id || `${fixture?.home_en}-${fixture?.away_en}-${fixture?.kickoff_at}`);
}

function previousFixtures(previous) {
  const map = new Map();
  const clubs = Array.isArray(previous?.clubs)
    ? previous.clubs
    : (Array.isArray(previous?.teams) ? [{ key: 'city', teams: previous.teams }] : []);
  for (const club of clubs) {
    for (const team of club.teams || []) {
      for (const fixture of team.fixtures || []) {
        map.set(`${club.key}:${team.key}:${fixtureStableKey(fixture)}`, fixture);
      }
    }
  }
  return map;
}

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 700));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function loadPrevious() {
  const candidates = [];
  if (process.env.PREV_INTERNATIONAL_DUTY_URL) {
    try { candidates.push(await fetchJson(`${process.env.PREV_INTERNATIONAL_DUTY_URL}?t=${Date.now()}`, 1)); }
    catch { /* 首次上线时没有远端快照 */ }
  }
  try { candidates.push(JSON.parse(await fs.readFile(OUTPUT_PATH, 'utf8'))); }
  catch { /* 首次生成 */ }
  return candidates.find((item) => Array.isArray(item?.clubs) || Array.isArray(item?.teams)) || null;
}

function baseFixture(fixture, team, previous, now) {
  const kickoff = new Date(fixture.kickoff_at).getTime();
  const started = Number.isFinite(kickoff) && now.getTime() >= kickoff;
  const id = previous?.id || fixture.id || null;
  return {
    ...fixture,
    id,
    competition: fixture.competition || previous?.competition || '国家队比赛',
    status: previous?.status === '完场' ? '完场' : (started ? '赛后待更新' : '未开赛'),
    score: previous?.score || null,
    appearances: previous?.appearances || team.players.map((player) => ({
      name: player.name,
      name_en: player.name_en,
      status: '未开赛',
      minutes: null,
    })),
    url: id ? `https://www.fotmob.com/matches/x#${id}` : null,
    ...(previous?.last_attempted_at ? { last_attempted_at: previous.last_attempted_at } : {}),
    ...(previous?.checked_at ? { checked_at: previous.checked_at } : {}),
  };
}

function shouldFetchFixture(fixture, previous, now) {
  const hasImpossibleStarterMinutes = (previous?.appearances || []).some((appearance) => (
    appearance.status === '首发' && Number(appearance.minutes) === 0
  ));
  if (previous?.status === '完场' && !hasImpossibleStarterMinutes) return false;
  const dueAt = new Date(fixture.kickoff_at).getTime() + POST_MATCH_DELAY_MS;
  if (!Number.isFinite(dueAt) || now.getTime() < dueAt) return false;
  const attemptedAt = new Date(previous?.last_attempted_at || 0).getTime();
  return !Number.isFinite(attemptedAt) || now.getTime() - attemptedAt >= RETRY_INTERVAL_MS;
}

function matchCandidates(schedule) {
  return (schedule?.leagues || []).flatMap((league) => league.matches || []);
}

function resolveFixtureId(schedule, fixture) {
  const home = normalizeName(fixture.home_en);
  const away = normalizeName(fixture.away_en);
  const match = matchCandidates(schedule).find((item) => (
    normalizeName(item?.home?.name) === home && normalizeName(item?.away?.name) === away
  ));
  return match?.id ? String(match.id) : null;
}

function hydrateCompletedFixture(base, details, team, checkedAt) {
  const header = details?.header;
  const finished = header?.status?.finished === true;
  const teams = header?.teams || [];
  if (!finished || teams.length < 2) return { ...base, last_attempted_at: checkedAt };
  return {
    ...base,
    status: '完场',
    score: `${teams[0]?.score ?? '—'}-${teams[1]?.score ?? '—'}`,
    appearances: team.players.map((player) => playerAppearance(details, team, player)),
    checked_at: checkedAt,
    last_attempted_at: checkedAt,
  };
}

function playerMatches(club) {
  const players = [];
  for (const team of club.teams || []) {
    for (const player of team.players || []) {
      const matches = (team.fixtures || []).map((fixture) => {
        const appearance = (fixture.appearances || []).find((item) => (
          normalizeName(item.name_en || item.name) === normalizeName(player.name_en || player.name)
        ));
        return {
          id: fixture.id || null,
          url: fixture.url || null,
          kickoff_at: fixture.kickoff_at,
          home: fixture.home,
          away: fixture.away,
          competition: fixture.competition,
          match_status: fixture.status,
          score: fixture.score || null,
          status: appearance?.status || (fixture.status === '完场' ? '待补录' : '未开赛'),
          minutes: appearance?.minutes !== null && appearance?.minutes !== undefined && Number.isFinite(Number(appearance.minutes))
            ? Number(appearance.minutes)
            : null,
        };
      });
      const played = matches.filter((match) => match.status === '首发' || match.status === '替补登场');
      players.push({
        name: player.name,
        name_en: player.name_en,
        national_team: team.name,
        national_team_en: team.name_en,
        flag: team.flag,
        matches,
        summary: {
          minutes: played.reduce((sum, match) => sum + (Number(match.minutes) || 0), 0),
          appearances: played.length,
          starts: played.filter((match) => match.status === '首发').length,
          substitute_appearances: played.filter((match) => match.status === '替补登场').length,
          unused: matches.filter((match) => match.status === '替补未登场' || match.status === '未进名单').length,
        },
      });
    }
  }
  return players;
}

function clubSummary(club) {
  const fixtures = club.teams.flatMap((team) => team.fixtures || []);
  const matches = new Set(fixtures.map(fixtureStableKey));
  const completed = new Set(fixtures.filter((fixture) => fixture.status === '完场').map(fixtureStableKey));
  const minutes = (club.players || []).reduce((sum, player) => sum + (player.summary?.minutes || 0), 0);
  const appearances = (club.players || []).reduce((sum, player) => sum + (player.summary?.appearances || 0), 0);
  return {
    players: (club.players || []).length,
    national_teams: club.teams.length,
    matches: matches.size,
    completed: completed.size,
    minutes,
    appearances,
  };
}

export async function buildInternationalDuty(config, previous = null, now = new Date(), fetcher = fetchJson, scheduleFetcher = fetchJson) {
  const previousMap = previousFixtures(previous);
  const detailCache = new Map();
  const scheduleCache = new Map();
  let detailRequests = 0;
  let scheduleRequests = 0;
  const checkedAt = now.toISOString();
  const clubs = [];

  for (const clubConfig of configClubs(config)) {
    const teams = [];
    for (const team of clubConfig.teams || []) {
      const fixtures = [];
      for (const fixture of team.fixtures || []) {
        const prior = previousMap.get(`${clubConfig.key}:${team.key}:${fixtureStableKey(fixture)}`);
        let resolved = { ...fixture, id: prior?.id || fixture.id || null };
        let base = baseFixture(resolved, team, prior, now);
        if (!shouldFetchFixture(resolved, prior, now)) {
          fixtures.push(base);
          continue;
        }
        try {
          if (!resolved.id) {
            const date = String(resolved.kickoff_at || '').slice(0, 10).replaceAll('-', '');
            if (!scheduleCache.has(date)) {
              scheduleRequests += 1;
              scheduleCache.set(date, scheduleFetcher(`${FOTMOB_API}/matches?date=${date}&timezone=Europe%2FLondon`));
            }
            const schedule = await scheduleCache.get(date);
            resolved = { ...resolved, id: resolveFixtureId(schedule, resolved) };
            base = baseFixture(resolved, team, prior, now);
          }
          if (!resolved.id) {
            fixtures.push({ ...base, last_attempted_at: checkedAt });
            continue;
          }
          if (!detailCache.has(resolved.id)) {
            detailRequests += 1;
            detailCache.set(resolved.id, fetcher(`${FOTMOB_API}/matchDetails?matchId=${encodeURIComponent(resolved.id)}`));
          }
          const details = await detailCache.get(resolved.id);
          fixtures.push(hydrateCompletedFixture(base, details, team, checkedAt));
        } catch {
          fixtures.push({ ...base, last_attempted_at: checkedAt });
        }
      }
      teams.push({ ...team, fixtures });
    }
    const club = { ...clubConfig, teams };
    club.players = playerMatches(club);
    club.summary = clubSummary(club);
    clubs.push(club);
  }

  const allTeams = clubs.flatMap((club) => club.teams);
  const allFixtures = allTeams.flatMap((team) => team.fixtures || []);
  const uniqueMatches = new Set(allFixtures.map(fixtureStableKey));
  const completedMatches = new Set(allFixtures.filter((fixture) => fixture.status === '完场').map(fixtureStableKey));
  return {
    version: config.version || 2,
    generated_at: checkedAt,
    checked_at: checkedAt,
    title: config.title,
    window: config.window,
    sources: config.sources || (config.source ? [config.source] : []),
    timezone: 'Asia/Shanghai',
    summary: {
      players: clubs.reduce((sum, club) => sum + club.summary.players, 0),
      national_teams: new Set(allTeams.map((team) => team.key)).size,
      matches: uniqueMatches.size,
      completed: completedMatches.size,
      minutes: clubs.reduce((sum, club) => sum + club.summary.minutes, 0),
    },
    clubs,
    fetch: {
      requests: detailRequests + scheduleRequests,
      match_detail_requests: detailRequests,
      schedule_resolution_requests: scheduleRequests,
      policy: '预计完赛1小时后抓取一次；未完场时6小时后再试',
    },
  };
}

async function main() {
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
  const previous = await loadPrevious();
  const data = await buildInternationalDuty(config, previous, new Date());
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`International duty ready: ${data.summary.players} players, ${data.summary.matches} matches, ${data.fetch.requests} requests`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
