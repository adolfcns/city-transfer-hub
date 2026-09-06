import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetch } from 'undici';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUTPUT_PATH = resolve(ROOT, 'data', 'first-team-analysis.json');
const FOTMOB_API = 'https://www.fotmob.com/api/data';
const TEAM_ID = 8456;
const TEAM_NAME = 'Manchester City';
const SEASON_START = '2026-07-01T00:00:00Z';
const USER_AGENT = 'Mozilla/5.0 (compatible; CityTransferHub/1.0; +https://adolfcns.github.io/city-transfer-hub/)';
const MAX_MATCHES = 12;
const BOOTSTRAP_MATCHES = 5;
const DAILY_LIMIT = 40;

const PLAYER_ZH = Object.freeze({
  'Gianluigi Donnarumma': '多纳鲁马',
  'Erling Haaland': '哈兰德',
  'Elliot Anderson': '埃利奥特·安德森',
  'Marc Guéhi': '格伊',
  'Josko Gvardiol': '格瓦迪奥尔',
  'Rayan Cherki': '谢尔基',
  'Enzo Fernández': '恩佐·费尔南德斯',
  'Enzo Fernandez': '恩佐·费尔南德斯',
  'Antoine Semenyo': '塞梅尼奥',
  'Phil Foden': '福登',
  'Rodri': '罗德里',
  'Rúben Dias': '鲁本·迪亚斯',
  'Ruben Dias': '鲁本·迪亚斯',
  'Abdukodir Khusanov': '胡桑诺夫',
  "Nico O'Reilly": '奥赖利',
  'Ayyoub Bouaddi': '布阿迪',
  'Ryan McAidoo': '麦卡杜',
});

const TEAM_ZH = Object.freeze({
  'Manchester City': '曼城',
  'Man City': '曼城',
  'Crystal Palace': '水晶宫',
  'AFC Bournemouth': '伯恩茅斯',
  'Bournemouth': '伯恩茅斯',
  'Coventry City': '考文垂',
  'Coventry': '考文垂',
  'Arsenal': '阿森纳',
  'Atlético Madrid': '马德里竞技',
  'Atletico Madrid': '马德里竞技',
  'K-League All Stars': 'K联赛全明星',
});

const METRIC_GROUPS = Object.freeze({
  keeper: [
    ['saves', '扑救'],
    ['keeper_saves', '扑救'],
    ['goals_prevented', '阻止失球'],
    ['accurate_passes', '传球'],
  ],
  defender: [
    ['defensive_actions', '防守贡献'],
    ['recoveries', '夺回球权'],
    ['clearances', '解围'],
    ['interceptions', '拦截'],
    ['duel_won', '对抗成功'],
  ],
  midfielder: [
    ['expected_assists', '预期助攻'],
    ['chances_created', '创造机会'],
    ['passes_into_final_third', '进入三区'],
    ['recoveries', '夺回球权'],
    ['duel_won', '对抗成功'],
  ],
  attacker: [
    ['expected_goals', '预期进球'],
    ['expected_assists', '预期助攻'],
    ['total_shots', '射门'],
    ['ShotsOnTarget', '射正'],
    ['touches_opp_box', '禁区触球'],
    ['chances_created', '创造机会'],
  ],
});

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

async function fetchJson(url, { attempts = 2, timeoutMs = 18000, budget = null } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (budget) {
        if (budget.requests >= budget.limit) throw new Error('first_team_daily_budget_reached');
        budget.requests += 1;
      }
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts && error.message !== 'first_team_daily_budget_reached') await wait(attempt * 650);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('request failed');
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function loadPrevious() {
  const remote = process.env.PREV_FIRST_TEAM_ANALYSIS_URL;
  if (remote) {
    try {
      return await fetchJson(`${remote}${remote.includes('?') ? '&' : '?'}t=${Date.now()}`, { attempts: 1, timeoutMs: 12000 });
    } catch (error) {
      console.warn(`Previous first-team analysis unavailable: ${error.message}`);
    }
  }
  return readJsonFile(OUTPUT_PATH);
}

function asIso(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function numeric(value) {
  if (typeof value === 'number') return value;
  const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function percent(value) {
  const match = String(value ?? '').match(/(\d+(?:\.\d+)?)%/);
  return match ? Number(match[1]) : null;
}

function teamZh(name) {
  return TEAM_ZH[name] || name || '对手待定';
}

function playerZh(name) {
  return PLAYER_ZH[name] || name || '球员';
}

export function flattenTeamStats(details) {
  const result = {};
  const groups = details?.content?.stats?.Periods?.All?.stats || [];
  for (const group of groups) {
    for (const item of group?.stats || []) {
      if (!item?.key || !Array.isArray(item.stats) || item.stats.every((value) => value == null)) continue;
      if (!(item.key in result)) result[item.key] = item.stats;
    }
  }
  return result;
}

function flattenPlayerStats(playerStats) {
  const result = {};
  for (const section of playerStats?.stats || []) {
    for (const item of Object.values(section?.stats || {})) {
      if (!item?.key || item?.stat?.value === undefined) continue;
      result[item.key] = item.stat;
    }
  }
  return result;
}

function formatPlayerMetric(stat) {
  if (!stat || stat.value === undefined || stat.value === null) return null;
  if (stat.total !== undefined && stat.total !== null) return `${stat.value}/${stat.total}`;
  if (typeof stat.value === 'number' && !Number.isInteger(stat.value)) return Number(stat.value.toFixed(2)).toString();
  return String(stat.value);
}

function playerRole(playerStats, positionLabel) {
  const role = String(playerStats?.role || positionLabel?.key || '').toLowerCase();
  if (/keeper/.test(role)) return 'keeper';
  if (/back|defender/.test(role)) return 'defender';
  if (/striker|forward|winger/.test(role)) return 'attacker';
  return 'midfielder';
}

function selectPlayerMetrics(playerStats, positionLabel, limit = 3) {
  const flattened = flattenPlayerStats(playerStats);
  const role = playerRole(playerStats, positionLabel);
  const result = [];
  for (const [key, label] of METRIC_GROUPS[role]) {
    const value = formatPlayerMetric(flattened[key]);
    if (value === null) continue;
    result.push({ key, label, value });
    if (result.length >= limit) break;
  }
  return result;
}

function scoreResult(cityScore, opponentScore) {
  if (cityScore > opponentScore) return '胜';
  if (cityScore < opponentScore) return '负';
  return '平';
}

function outcomeHeadline(result, margin, opponentXg, xgDiff) {
  if (result === '胜' && margin === 1 && opponentXg >= 1) return '三分到手，但过程比比分更险';
  if (result === '胜' && xgDiff >= 0.8) return '从控场到机会，这场胜利有数据支撑';
  if (result === '胜') return '结果拿下，过程仍有值得复盘之处';
  if (result === '平' && xgDiff >= 0.8) return '优势没有完全兑现，问题出在最后一击';
  if (result === '平') return '比分停住了，比赛里的得失更值得看';
  if (xgDiff > 0.5) return '数据不差，比分却给出了最直接的警报';
  return '失利不只看结果，更要看优势为何没有建立';
}

function safeStat(stats, key, index, fallback = null) {
  return numeric(stats[key]?.[index]) ?? fallback;
}

function buildStory({ cityScore, opponentScore, cityIndex, opponentIndex, stats, keeperSaves, goals }) {
  const possession = safeStat(stats, 'BallPossesion', cityIndex, 50);
  const opponentPossession = safeStat(stats, 'BallPossesion', opponentIndex, 100 - possession);
  const xg = safeStat(stats, 'expected_goals', cityIndex, 0);
  const opponentXg = safeStat(stats, 'expected_goals', opponentIndex, 0);
  const shots = safeStat(stats, 'total_shots', cityIndex, 0);
  const opponentShots = safeStat(stats, 'total_shots', opponentIndex, 0);
  const shotsOnTarget = safeStat(stats, 'ShotsOnTarget', cityIndex, 0);
  const opponentShotsOnTarget = safeStat(stats, 'ShotsOnTarget', opponentIndex, 0);
  const bigChances = safeStat(stats, 'big_chance', cityIndex, 0);
  const opponentBigChances = safeStat(stats, 'big_chance', opponentIndex, 0);
  const boxTouches = safeStat(stats, 'touches_opp_box', cityIndex, 0);
  const opponentBoxTouches = safeStat(stats, 'touches_opp_box', opponentIndex, 0);
  const accuratePasses = stats.accurate_passes?.[cityIndex] ?? '—';
  const passAccuracy = percent(accuratePasses);
  const result = scoreResult(cityScore, opponentScore);
  const margin = Math.abs(cityScore - opponentScore);
  const xgDiff = xg - opponentXg;
  const headline = outcomeHeadline(result, margin, opponentXg, xgDiff);
  const controlTone = possession >= 65 ? '明显掌握球权' : possession >= 55 ? '拥有更多球权' : '没有依靠控球建立绝对优势';
  const chanceTone = xgDiff >= 0.8 ? '机会质量明显占优' : xgDiff >= 0.2 ? '机会质量略占上风' : xgDiff <= -0.5 ? '机会质量落后于对手' : '双方机会质量接近';
  const defenceTone = opponentXg >= 1.2
    ? `${opponentXg.toFixed(2)} 的对手 xG 和 ${opponentBigChances} 次绝佳机会说明防线承受了真实压力`
    : `将对手限制在 ${opponentXg.toFixed(2)} xG，防守端总体可控`;
  const goalText = goals.length
    ? goals.map((goal) => `${goal.minute}′ ${goal.player}${goal.assist ? `（${goal.assist}助攻）` : ''}`).join('；')
    : '本场没有进球节点';
  return {
    headline,
    verdict: `曼城${controlTone}，控球率 ${possession}% 对 ${opponentPossession}%；全场 xG ${xg.toFixed(2)}-${opponentXg.toFixed(2)}，${chanceTone}。比分是 ${cityScore}-${opponentScore}，但判断比赛不能只看结果。`,
    sections: [
      {
        key: 'control',
        title: '控场',
        text: `控球率 ${possession}%，完成 ${accuratePasses} 次准确传球${passAccuracy === null ? '' : `，成功率 ${passAccuracy}%`}。${possession >= 65 && xgDiff < 0.5 ? '球在脚下很多，但控球并未等比例转化为高质量机会。' : '球权与机会产出基本形成了正向关系。'}`,
      },
      {
        key: 'attack',
        title: '进攻',
        text: `${shots} 次射门、${shotsOnTarget} 次射正、${bigChances} 次绝佳机会、${boxTouches} 次禁区触球，累计 ${xg.toFixed(2)} xG，最终打进 ${cityScore} 球。${bigChances > cityScore ? '把优势更早变成进球，比赛会轻松得多。' : '机会兑现效率与比赛结果相符。'}`,
      },
      {
        key: 'defence',
        title: '防守',
        text: `对手得到 ${opponentShots} 次射门、${opponentShotsOnTarget} 次射正、${opponentBigChances} 次绝佳机会和 ${opponentBoxTouches} 次禁区触球；${defenceTone}${keeperSaves ? `，门将完成 ${keeperSaves} 次扑救` : ''}。`,
      },
      {
        key: 'turning',
        title: '关键节点',
        text: goalText,
      },
    ],
  };
}

function goalEvents(details, cityIndex) {
  const goalGroup = cityIndex === 0 ? details?.header?.events?.homeTeamGoals : details?.header?.events?.awayTeamGoals;
  const goals = [];
  for (const events of Object.values(goalGroup || {})) {
    for (const event of events || []) {
      goals.push({
        minute: Number(event.time || 0),
        player: playerZh(event.fullName || event.nameStr || event.player?.name),
        player_en: event.fullName || event.nameStr || event.player?.name || '',
        assist: event.assistInput ? playerZh(event.assistInput) : null,
        type: event.goalDescription || 'Goal',
      });
    }
  }
  return goals.sort((a, b) => a.minute - b.minute);
}

export function buildMatchAnalysis(details, fixture, now = new Date()) {
  const teams = details?.header?.teams || [];
  const cityIndex = teams.findIndex((team) => Number(team?.id) === TEAM_ID);
  if (cityIndex < 0 || teams.length < 2) throw new Error('Manchester City not found in match details');
  const opponentIndex = cityIndex === 0 ? 1 : 0;
  const cityTeam = teams[cityIndex];
  const opponentTeam = teams[opponentIndex];
  const cityScore = Number(cityTeam?.score || 0);
  const opponentScore = Number(opponentTeam?.score || 0);
  const stats = flattenTeamStats(details);
  const goals = goalEvents(details, cityIndex);
  const topGroup = cityIndex === 0
    ? details?.content?.matchFacts?.topPlayers?.homeTopPlayers
    : details?.content?.matchFacts?.topPlayers?.awayTopPlayers;
  const topPlayers = (topGroup || []).slice(0, 5).map((player) => {
    const playerStats = details?.content?.playerStats?.[String(player.playerId)];
    return {
      id: String(player.playerId),
      name: playerZh(player.name?.fullName),
      name_en: player.name?.fullName || '',
      rating: Number(player.playerRating || player.playerRatingRounded || 0),
      position: player.positionLabel?.label || '',
      player_url: `https://www.fotmob.com/players/${player.playerId}/${String(player.name?.fullName || 'player').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      man_of_the_match: Boolean(player.manOfTheMatch),
      metrics: selectPlayerMetrics(playerStats, player.positionLabel),
    };
  });
  const keeper = topPlayers.find((player) => /GK/i.test(player.position));
  const keeperStats = keeper ? flattenPlayerStats(details?.content?.playerStats?.[keeper.id]) : {};
  const keeperSaves = numeric(keeperStats.saves?.value ?? keeperStats.keeper_saves?.value ?? stats.keeper_saves?.[cityIndex]) || 0;
  const story = buildStory({ cityScore, opponentScore, cityIndex, opponentIndex, stats, keeperSaves, goals });
  const postReview = (details?.content?.matchFacts?.postReview || []).find((item) => item.lang === 'en' && item.source === 'Opta')
    || (details?.content?.matchFacts?.postReview || []).find((item) => item.lang === 'en');
  const kickoff = asIso(details?.header?.status?.utcTime || fixture?.status?.utcTime);
  const statCards = [
    ['BallPossesion', '控球率', '%'],
    ['expected_goals', '预期进球', ''],
    ['total_shots', '射门', ''],
    ['ShotsOnTarget', '射正', ''],
    ['big_chance', '绝佳机会', ''],
    ['touches_opp_box', '禁区触球', ''],
  ].map(([key, label, suffix]) => ({
    key,
    label,
    city: numeric(stats[key]?.[cityIndex]) ?? 0,
    opponent: numeric(stats[key]?.[opponentIndex]) ?? 0,
    suffix,
  }));
  return {
    id: String(fixture?.id || details?.general?.matchId || details?.content?.matchFacts?.matchId),
    date: kickoff,
    analysed_at: now.toISOString(),
    competition: fixture?.tournament?.name || details?.general?.leagueName || '',
    is_home: cityIndex === 0,
    city: { name: '曼城', name_en: cityTeam.name || TEAM_NAME, score: cityScore },
    opponent: { name: teamZh(opponentTeam.name), name_en: opponentTeam.name || '', score: opponentScore },
    score: cityIndex === 0 ? `${cityScore}-${opponentScore}` : `${opponentScore}-${cityScore}`,
    result: scoreResult(cityScore, opponentScore),
    headline: story.headline,
    verdict: story.verdict,
    analysis: story.sections,
    stats: statCards,
    goals,
    top_players: topPlayers,
    opta_review: postReview ? {
      source: postReview.source || 'Opta',
      title: postReview.title || '',
      url: postReview.shareUrl || '',
      updated_at: asIso(postReview.dateUpdated),
    } : null,
    match_url: fixture?.pageUrl ? `https://www.fotmob.com${fixture.pageUrl}` : `https://www.fotmob.com/matches/x#${fixture?.id}`,
    official_results_url: 'https://www.mancity.com/results/mens',
  };
}

function completedFixtures(teamData) {
  return (teamData?.fixtures?.allFixtures?.fixtures || [])
    .filter((fixture) => fixture?.status?.finished)
    .filter((fixture) => Number(fixture?.home?.id) === TEAM_ID || Number(fixture?.away?.id) === TEAM_ID)
    .filter((fixture) => new Date(fixture?.status?.utcTime).getTime() >= new Date(SEASON_START).getTime())
    .sort((a, b) => String(b.status.utcTime).localeCompare(String(a.status.utcTime)));
}

function createBudget(previous, now) {
  const date = now.toISOString().slice(0, 10);
  const prior = previous?.provider_usage;
  return {
    date,
    requests: prior?.date === date ? Number(prior.requests || 0) : 0,
    limit: DAILY_LIMIT,
  };
}

function needsRefresh(previousMatch, fixture, now) {
  if (!previousMatch) return true;
  if (previousMatch.opta_review && previousMatch.top_players?.length && previousMatch.stats?.length) return false;
  const kickoffAge = now.getTime() - new Date(fixture?.status?.utcTime).getTime();
  const checkedAge = now.getTime() - new Date(previousMatch.analysed_at || 0).getTime();
  return kickoffAge < 72 * 60 * 60 * 1000 && checkedAge >= 3 * 60 * 60 * 1000;
}

export async function buildFirstTeamAnalysisData({ now = new Date() } = {}) {
  const previous = await loadPrevious();
  const budget = createBudget(previous, now);
  const previousById = new Map((previous?.matches || []).map((match) => [String(match.id), match]));
  let teamData;
  try {
    teamData = await fetchJson(`${FOTMOB_API}/teams?id=${TEAM_ID}&ccode3=USA`, { budget });
  } catch (error) {
    if (previous?.matches?.length) {
      return { ...previous, checked_at: now.toISOString(), stale: true, last_error: error.message, provider_usage: budget };
    }
    throw error;
  }

  const fixtures = completedFixtures(teamData).slice(0, MAX_MATCHES);
  const bootstrap = previousById.size === 0;
  const analyses = new Map(previousById);
  let changed = false;
  let fetched = 0;
  for (const fixture of fixtures) {
    const prior = previousById.get(String(fixture.id));
    if (!needsRefresh(prior, fixture, now)) continue;
    if (bootstrap && fetched >= BOOTSTRAP_MATCHES) continue;
    try {
      const details = await fetchJson(`${FOTMOB_API}/matchDetails?matchId=${encodeURIComponent(fixture.id)}`, { budget });
      if (!details?.header?.status?.finished) continue;
      analyses.set(String(fixture.id), buildMatchAnalysis(details, fixture, now));
      fetched += 1;
      changed = true;
    } catch (error) {
      console.warn(`First-team match ${fixture.id} unavailable: ${error.message}`);
    }
  }

  const matches = [...analyses.values()]
    .filter((match) => new Date(match.date).getTime() >= new Date(SEASON_START).getTime())
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, MAX_MATCHES);
  if (!matches.length) throw new Error('No completed Manchester City match analysis is available');
  return {
    version: 1,
    generated_at: changed || !previous?.generated_at ? now.toISOString() : previous.generated_at,
    checked_at: now.toISOString(),
    team_id: TEAM_ID,
    season_start: SEASON_START,
    provider_usage: budget,
    provider: {
      name: 'FotMob',
      url: 'https://www.fotmob.com',
      note: '比赛事实、评分及 xG 等来自 FotMob 展示的公开比赛数据；Opta 战报仅展示标题并链接原文。本站中文复盘由数据规则自动生成，不代表 Opta 官方观点。',
    },
    total: matches.length,
    latest_match_id: matches[0]?.id || null,
    matches,
  };
}

async function main() {
  const data = await buildFirstTeamAnalysisData();
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`First-team analysis ready: ${data.matches.length} matches, ${data.provider_usage.requests}/${data.provider_usage.limit} requests today`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(async (error) => {
    console.error(`First-team analysis update failed: ${error.stack || error.message}`);
    const previous = await readJsonFile(OUTPUT_PATH);
    if (previous?.matches?.length) {
      await writeFile(OUTPUT_PATH, `${JSON.stringify({ ...previous, checked_at: new Date().toISOString(), stale: true, last_error: error.message }, null, 2)}\n`, 'utf8');
      console.warn('Kept the previous first-team analysis snapshot.');
      return;
    }
    process.exitCode = 1;
  });
}
