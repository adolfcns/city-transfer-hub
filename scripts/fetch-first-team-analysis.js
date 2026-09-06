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
const TACTICAL_LONGFORM_VERSION = 7;
const PROVIDER_NOTE = '比赛事实、评分、阵型、射门图及 xG 来自 FotMob 公开比赛数据；中文战术复盘由本站撰写。';

const MATCH_TACTICAL_CONTEXT = Object.freeze({
  '5795442': Object.freeze({
    formation: Object.freeze({
      preferred: '4-2-3-1',
      alternatives: ['4-1-4-1'],
      opponent_family: '三中卫体系',
      note: 'FOX Sports 的赛后阵容表记为 4-2-3-1，FotMob 记为 4-1-4-1。本文采用 4-2-3-1：安德森与恩佐搭档中场，谢尔基居中。',
    }),
    lineup_change: '曼城官方赛后确认，奥赖利在热身后退出，恩佐直到开球前几分钟才进入首发。马雷斯卡的中场安排因此在临开场时发生了变化。',
    role_read: '按 4-2-3-1 来读，安德森和恩佐在中路搭档，谢尔基站在哈兰德身后，塞梅尼奥与恩迪亚耶分居两侧。这样摆的目的很直接：中路先把球送到谢尔基脚下，两边再利用一对一或传中找哈兰德。',
    goal_sequence: '26分钟的进球正好跑通了这条线路：恩佐先把球送到前场，塞梅尼奥在边路接球后传中，哈兰德摆脱盯防完成头球。这个回合里，中场负责把球送出去，边锋负责把进攻提速，中锋负责最后一下，三条线的分工是清楚的。',
    early_risk: '开场的两次险情来自连续的处理球失误：胡桑诺夫回传险些直接送礼，塞梅尼奥随后又传丢球让对手获得单刀。更深一层的问题是，失误出现后身后的保护也没有及时补上。',
    sources: Object.freeze([
      Object.freeze({ label: '曼城官方战报', url: 'https://live.mancity.com/news/mens/manchester-city-v-coventry-city-match-report-63924211' }),
      Object.freeze({ label: 'FOX Sports阵容', url: 'https://www.foxsports.com/soccer/premier-league-man-city-vs-coventry-city-sep-05-2026-game-boxscore-891093' }),
      Object.freeze({ label: 'FotMob比赛页', url: 'https://www.fotmob.com/matches/man-city-vs-coventry/2fb7wc' }),
    ]),
  }),
});

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
  'Divin Mubama': '迪万·穆巴马',
  'Iliman Ndiaye': '伊利曼·恩迪亚耶',
  'Jérémy Doku': '杰里米·多库',
  'Jeremy Doku': '杰里米·多库',
  'Mateo Kovacic': '马特奥·科瓦契奇',
  'Mateo Kovačić': '马特奥·科瓦契奇',
  'Matheus Nunes': '马特乌斯·努内斯',
  'Omar Marmoush': '奥马尔·马尔穆什',
  'Rayan Aït-Nouri': '拉扬·艾特-努里',
  'Rico Lewis': '里科·刘易斯',
  'Savinho': '萨维尼奥',
  'Stephen Mfuni': '斯蒂芬·姆富尼',
  'Tijjani Reijnders': '蒂贾尼·赖因德斯',
  'Vitor Reis': '维托尔·雷斯',
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
  'Inter': '国际米兰',
});

const COACH_ZH = Object.freeze({
  'Enzo Maresca': '马雷斯卡',
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

function coachZh(name) {
  return COACH_ZH[name] || name || '主教练';
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
    verdict: `曼城${controlTone}，控球率 ${possession}% 对 ${opponentPossession}%；全场 xG ${xg.toFixed(2)}-${opponentXg.toFixed(2)}，${chanceTone}。最终比分 ${cityScore}-${opponentScore}。`,
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

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
}

function lineupSnapshot(details, cityIndex) {
  const lineup = details?.content?.lineup || {};
  const city = cityIndex === 0 ? lineup.homeTeam : lineup.awayTeam;
  const opponent = cityIndex === 0 ? lineup.awayTeam : lineup.homeTeam;
  const starters = (team) => (team?.starters || []).map((player) => ({
    id: String(player.id || ''),
    name: playerZh(player.name),
    name_en: player.name || '',
    position_id: numeric(player.positionId),
    rating: numeric(player.performance?.rating),
  }));
  const substitutions = (team) => {
    const outs = new Map();
    const ins = new Map();
    for (const player of team?.starters || []) {
      for (const event of player.performance?.substitutionEvents || []) {
        if (event?.type !== 'subOut') continue;
        const minute = Number(event.time || 0);
        if (!outs.has(minute)) outs.set(minute, []);
        outs.get(minute).push({
          name: playerZh(player.name),
          name_en: player.name || '',
          usual_position_id: numeric(player.usualPlayingPositionId),
          reason: event.reason || 'tactical',
        });
      }
    }
    for (const player of team?.subs || []) {
      for (const event of player.performance?.substitutionEvents || []) {
        if (event?.type !== 'subIn') continue;
        const minute = Number(event.time || 0);
        if (!ins.has(minute)) ins.set(minute, []);
        ins.get(minute).push({
          name: playerZh(player.name),
          name_en: player.name || '',
          usual_position_id: numeric(player.usualPlayingPositionId),
          reason: event.reason || 'tactical',
        });
      }
    }
    return [...new Set([...outs.keys(), ...ins.keys()])]
      .sort((a, b) => a - b)
      .flatMap((minute) => {
        const playersOut = outs.get(minute) || [];
        const playersIn = ins.get(minute) || [];
        const count = Math.max(playersOut.length, playersIn.length);
        return Array.from({ length: count }, (_, index) => ({
          minute,
          out: playersOut[index]?.name || '',
          out_en: playersOut[index]?.name_en || '',
          in: playersIn[index]?.name || '',
          in_en: playersIn[index]?.name_en || '',
          out_position_id: playersOut[index]?.usual_position_id ?? null,
          in_position_id: playersIn[index]?.usual_position_id ?? null,
          reason: playersOut[index]?.reason || playersIn[index]?.reason || 'tactical',
        }));
      });
  };
  return {
    city_coach: coachZh(city?.coach?.name),
    city_coach_en: city?.coach?.name || '',
    city_formation: city?.formation || '',
    opponent_formation: opponent?.formation || '',
    city_starting_xi: starters(city),
    opponent_starting_xi: starters(opponent),
    city_substitutions: substitutions(city),
  };
}

function addMatchTacticalContext(lineup, matchId) {
  const context = MATCH_TACTICAL_CONTEXT[String(matchId || '')];
  if (!context) return lineup;
  return {
    ...lineup,
    formation_context: context.formation,
    editorial_context: {
      lineup_change: context.lineup_change,
      role_read: context.role_read,
      goal_sequence: context.goal_sequence,
      early_risk: context.early_risk,
    },
    context_sources: context.sources,
  };
}

function summariseShots(details, teamId) {
  const shots = (details?.content?.shotmap?.shots || []).filter((shot) => Number(shot.teamId) === Number(teamId));
  const sumXg = (items) => round(items.reduce((sum, shot) => sum + Number(shot.expectedGoals || 0), 0));
  const regular = shots.filter((shot) => shot.situation === 'RegularPlay');
  const fastBreak = shots.filter((shot) => shot.situation === 'FastBreak');
  const setPiece = shots.filter((shot) => !['RegularPlay', 'FastBreak'].includes(shot.situation));
  const firstHalf = shots.filter((shot) => shot.period === 'FirstHalf');
  const secondHalf = shots.filter((shot) => shot.period === 'SecondHalf');
  return {
    available: shots.length > 0,
    total: shots.length,
    xg: sumXg(shots),
    inside_box: shots.filter((shot) => shot.isFromInsideBox).length,
    outside_box: shots.filter((shot) => !shot.isFromInsideBox).length,
    open_play: regular.length + fastBreak.length,
    open_play_xg: sumXg([...regular, ...fastBreak]),
    set_piece: setPiece.length,
    set_piece_xg: sumXg(setPiece),
    high_quality: shots.filter((shot) => Number(shot.expectedGoals || 0) >= 0.3).length,
    first_half: { shots: firstHalf.length, xg: sumXg(firstHalf) },
    second_half: { shots: secondHalf.length, xg: sumXg(secondHalf) },
    timeline: shots.map((shot) => ({
      minute: Number(shot.min || 0),
      xg: round(Number(shot.expectedGoals || 0)),
      on_target: Boolean(shot.isOnTarget),
      inside_box: Boolean(shot.isFromInsideBox),
      situation: shot.situation || '',
      event_type: shot.eventType || '',
    })).sort((a, b) => a.minute - b.minute),
  };
}

function attackZoneSnapshot(details, cityIndex) {
  const zones = details?.content?.attackingZones || {};
  const city = cityIndex === 0 ? zones.home : zones.away;
  const opponent = cityIndex === 0 ? zones.away : zones.home;
  const normalise = (value) => value ? {
    total: value.total || null,
    first_half: value.firstHalf || null,
    second_half: value.secondHalf || null,
  } : null;
  return { city: normalise(city), opponent: normalise(opponent) };
}

function zoneText(zones) {
  if (!zones?.total) return null;
  const { left = 0, center = 0, right = 0 } = zones.total;
  const leading = [['左路', left], ['中路', center], ['右路', right]].sort((a, b) => b[1] - a[1])[0];
  return `左路 ${left}%、中路 ${center}%、右路 ${right}%，其中${leading[0]}占比最高`;
}

function formationIdea(formation) {
  if (/4-1-4-1/.test(formation)) return '思路是单后腰托底，两个中前卫往前站，边路把场地拉开。';
  if (/4-2-3-1/.test(formation)) return '思路是双后腰稳住出球，前腰去接两条线之间的球，两名边锋负责把防线撑开。';
  if (/4-3-3/.test(formation)) return '思路是用三中场控制中路，再让边锋和边后卫把宽度做出来。';
  if (/3-/.test(formation)) return '思路是先用三名后卫保证出球人数，再把翼卫推高。';
  return formation ? '阵型只是开场站位，真正要看的是球员拿球后往哪里走。' : '';
}

function lineupRoleText(lineup) {
  if (lineup?.editorial_context?.role_read) return lineup.editorial_context.role_read;
  const starters = lineup?.city_starting_xi || [];
  const namesBetween = (min, max) => starters
    .filter((player) => Number(player.position_id) >= min && Number(player.position_id) <= max)
    .map((player) => player.name);
  const holders = namesBetween(60, 79);
  const attackingBand = namesBetween(80, 99);
  const forwards = starters.filter((player) => Number(player.position_id) >= 100).map((player) => player.name);
  const parts = [];
  if (holders.length) parts.push(`后腰线是${holders.join('、')}`);
  if (attackingBand.length) parts.push(`身前一排是${attackingBand.join('、')}`);
  if (forwards.length) parts.push(`最前面是${forwards.join('、')}`);
  return parts.length ? `从开场落位看，${parts.join('，')}。` : '';
}

function formationMatchupText(cityFormation, opponentFormation, opponentName) {
  if (/4-1-4-1/.test(cityFormation) && /3-4-3/.test(opponentFormation)) {
    return `${opponentName}的三中卫可以一起照顾哈兰德，两个翼卫又能顶住边路。曼城要拆这套防线，光让边锋站宽不够，两名中前卫还得往肋部和禁区里插，把其中一名中卫带出来。4-1-4-1的风险也在这里：两名中前卫都压上以后，单后腰身边会很空。`;
  }
  if (/4-2-3-1/.test(cityFormation) && /3-4-2-1/.test(opponentFormation)) {
    return `${opponentName}用两名前腰站在曼城双后腰两侧，正好盯着出球的接应点。曼城如果只在双后腰脚下横传，推进会很慢；破法是边后卫或前腰主动落下来，先多造出一个接球点。`;
  }
  if (/4-2-3-1/.test(cityFormation) && /4-4-2/.test(opponentFormation)) {
    return `${opponentName}的两名前锋先封中路，两排四人再守住宽度。曼城双后腰拿球不难，难的是把第一脚向前传送到对手中场身后。`;
  }
  if (/4-2-3-1/.test(cityFormation) && /4-3-3/.test(opponentFormation)) {
    return `${opponentName}用三中场守住中路，曼城的前腰需要不断换位，把对方后腰从位置上带走；否则双后腰会有球，却找不到向前的线路。`;
  }
  if (cityFormation && opponentFormation) {
    return `${cityFormation}对${opponentFormation}，胜负点不在阵型名字，而在谁能先把球送到对方中场身后。`;
  }
  return '';
}

function shotWindow(snapshot, fromMinute, toMinute) {
  const events = (snapshot?.timeline || []).filter((shot) => shot.minute >= fromMinute && shot.minute < toMinute);
  return {
    shots: events.length,
    xg: round(events.reduce((sum, shot) => sum + Number(shot.xg || 0), 0)),
    on_target: events.filter((shot) => shot.on_target).length,
  };
}

function substitutionReview({ coachName, lineup, shots, opponentShots }) {
  const substitutions = lineup?.city_substitutions;
  if (!Array.isArray(substitutions)) {
    return ['这一场的旧数据没有留下完整换人时间，本节暂缺。'];
  }
  if (!substitutions.length) {
    return [`${coachName}全场没有换人，或者比赛页面没有记录到换人。`];
  }
  const changeLine = substitutions.map((change) => {
    const pair = change.out && change.in
      ? `${change.out}下，${change.in}上`
      : change.in ? `${change.in}上` : `${change.out}下`;
    return `${change.minute}分钟${pair}${change.reason === 'tactical' ? '' : '（被动换人）'}`;
  }).join('；');
  const paragraphs = [`${coachName}这场的换人是：${changeLine}。`];
  const firstTactical = substitutions.find((change) => change.reason === 'tactical');
  if (!firstTactical) {
    paragraphs.push('这几次换人都由伤情或其他被动情况触发，没有出现主动变阵。');
    return paragraphs;
  }
  const minute = firstTactical.minute;
  const before = shotWindow(shots, Math.max(46, minute - 15), minute);
  const after = shotWindow(shots, minute, Math.min(96, minute + 15));
  const opponentAfter = shotWindow(opponentShots, minute, Math.min(96, minute + 15));
  if (shots?.timeline?.length) {
    const names = firstTactical.out && firstTactical.in ? `${firstTactical.in}换下${firstTactical.out}` : '第一次主动调整';
    let effect = '场面没有立刻出现明显变化。';
    if (after.xg >= before.xg + 0.25 || after.shots >= before.shots + 2) effect = '换人后的这段时间，进攻有了起色。';
    else if (after.xg + 0.15 < before.xg && after.shots <= before.shots) effect = '换完以后，进攻反而更安静了。';
    paragraphs.push(`${names}前15分钟，曼城有 ${before.shots} 次射门、${before.xg.toFixed(2)} xG；换人后15分钟是 ${after.shots} 次射门、${after.xg.toFixed(2)} xG。${effect}`);
    if (minute >= 65 && before.xg < 0.3) {
      paragraphs.push(`下半场进攻已经卡了一阵，${coachName}到 ${minute} 分钟才第一次主动动人。这个调整偏慢。`);
    } else if (minute <= 60 && before.xg < 0.3) {
      paragraphs.push(`进攻刚开始发闷，${coachName}就在 ${minute} 分钟动手，反应及时。`);
    }
    if (opponentAfter.xg >= 0.5 || opponentAfter.shots >= 4) {
      paragraphs.push(`换人后15分钟，对手也有 ${opponentAfter.shots} 次射门、${opponentAfter.xg.toFixed(2)} xG。往前加人以后，身后的保护没有跟上。`);
    }
    for (const change of substitutions.filter((item) => item.reason === 'tactical' && item !== firstTactical)) {
      const cityRest = shotWindow(shots, change.minute, 96);
      const opponentRest = shotWindow(opponentShots, change.minute, 96);
      let verdict = '这次调整以后，两边的威胁变化不大。';
      if (opponentRest.shots >= cityRest.shots + 2) {
        verdict = `曼城自己还有 ${cityRest.shots} 次射门、${cityRest.xg.toFixed(2)} xG，但对手也起脚 ${opponentRest.shots} 次。换完以后，场面没有真正安静下来。`;
      } else if (cityRest.xg >= opponentRest.xg + 0.25) {
        verdict = `此后曼城做出 ${cityRest.xg.toFixed(2)} xG，对手是 ${opponentRest.xg.toFixed(2)}。到终场前，主动权仍在曼城这边。`;
      }
      paragraphs.push(`${change.minute}分钟${change.in || '替补'}换下${change.out || '首发'}。${verdict}`);
    }
  }
  return paragraphs;
}

function buildTacticalLongform({
  opponentName,
  cityScore,
  opponentScore,
  cityIndex,
  stats,
  goals,
  keeperSaves,
  lineup,
  shots,
  opponentShots,
  attackingZones,
}) {
  const possession = safeStat(stats, 'BallPossesion', cityIndex, 50);
  const opponentIndex = cityIndex === 0 ? 1 : 0;
  const xg = safeStat(stats, 'expected_goals', cityIndex, null);
  const opponentXg = safeStat(stats, 'expected_goals', opponentIndex, null);
  const hasXg = xg !== null && opponentXg !== null && (xg > 0 || opponentXg > 0);
  const cityShotTotal = shots.available ? shots.total : safeStat(stats, 'total_shots', cityIndex, 0);
  const opponentShotTotal = opponentShots.available ? opponentShots.total : safeStat(stats, 'total_shots', opponentIndex, 0);
  const bigChances = safeStat(stats, 'big_chance', cityIndex, 0);
  const opponentBigChances = safeStat(stats, 'big_chance', opponentIndex, 0);
  const boxTouches = safeStat(stats, 'touches_opp_box', cityIndex, 0);
  const opponentBoxTouches = safeStat(stats, 'touches_opp_box', opponentIndex, 0);
  const accuratePassesRaw = stats.accurate_passes?.[cityIndex] ?? '—';
  const accuratePasses = numeric(accuratePassesRaw) ?? '—';
  const passAccuracy = percent(accuratePassesRaw);
  const conversionGap = Math.max(0, bigChances - cityScore);
  const xgLead = hasXg ? xg - opponentXg : null;
  const coachName = lineup.city_coach || '马雷斯卡';
  const firstTacticalSub = (lineup.city_substitutions || []).find((change) => change.reason === 'tactical');
  const quietBeforeFirstSub = firstTacticalSub
    ? shotWindow(shots, 46, firstTacticalSub.minute)
    : null;
  const problems = [];
  if (firstTacticalSub && firstTacticalSub.minute >= 65 && quietBeforeFirstSub?.xg < 0.3) {
    problems.push(`下半场前 ${firstTacticalSub.minute - 45} 分钟只做出 ${quietBeforeFirstSub.shots} 次射门、${quietBeforeFirstSub.xg.toFixed(2)} xG，${coachName}到 ${firstTacticalSub.minute} 分钟才第一次主动换人，慢了。`);
  }
  if (possession >= 65 && (!hasXg || xgLead < 1)) {
    problems.push(`控球有 ${possession}%，${hasXg ? `xG 却只比对手多 ${Math.max(0, xgLead).toFixed(2)}` : '但没有打出压倒性的机会优势'}。球一直在曼城脚下，${coachName}的进攻结构却没把对手压垮。`);
  }
  if (opponentBigChances >= 3 || (hasXg && opponentXg >= 1.2)) {
    problems.push(`${opponentName}拿到 ${opponentBigChances} 次绝佳机会${hasXg ? `、${opponentXg.toFixed(2)} xG` : ''}。${cityScore > opponentScore ? '球赢了，防守却一点也不稳。' : '防守没有把比赛托住。'}`);
  }
  if (conversionGap > 0) {
    problems.push(`${bigChances} 次绝佳机会只进 ${cityScore} 个。机会已经到了门前，最后一脚的处理也需要球员提高。`);
  }
  if (shots.available && shots.second_half.xg + 0.35 < shots.first_half.xg) {
    problems.push(`下半场只有 ${shots.second_half.xg.toFixed(2)} xG。领先以后，球队把主动权踢没了一截。`);
  }
  if (!problems.length) {
    problems.push('开场方案运转顺畅，临场调整也维持了比赛主动权。');
  }
  const formationContext = lineup.formation_context || null;
  const editorialContext = lineup.editorial_context || {};
  const preferredFormation = formationContext?.preferred || lineup.city_formation || '';
  const title = possession >= 68 && (cityScore - opponentScore === 1 || opponentXg >= 1.2)
    ? `${coachName}的开场站位该怎么读：对${opponentName}有${possession}%控球，为什么还踢得这么险？`
    : `${coachName}对${opponentName}怎么布置，又是怎么调整的？`;
  const formationLine = formationContext
    ? `先把阵型说清：${formationContext.note}`
    : lineup.city_formation
      ? `${coachName}开场摆出 ${lineup.city_formation}${lineup.opponent_formation ? `，${opponentName}是 ${lineup.opponent_formation}` : ''}。${formationIdea(lineup.city_formation)}`
    : `本场开场阵型未收录，以下从进攻路线和比赛结果切入。`;
  const roles = lineupRoleText(lineup);
  const matchupParagraph = formationContext?.opponent_family
    ? `${opponentName}采用三中卫加翼卫，三名中卫可以协力限制哈兰德。曼城如果只把球送到边路再传中，很容易变成对手喜欢的防守方式；谢尔基和另一名中场需要在肋部接到球，先把其中一名中卫带出来。`
    : formationMatchupText(preferredFormation, lineup.opponent_formation, opponentName);
  const zone = zoneText(attackingZones.city);
  const zoneParagraph = zone
    ? `曼城的推进分布是${zone}。${attackingZones.city.total.right + 5 < attackingZones.city.total.left ? '右路用得偏少，两边没有形成同样的压力。' : attackingZones.city.total.left + 5 < attackingZones.city.total.right ? '左路用得偏少，两边没有形成同样的压力。' : '两边的使用比较接近。'}`
    : '本场未收录进攻方向，改看禁区触球和射门落点。';
  const boxParagraph = shots.available
    ? `曼城有 ${boxTouches} 次禁区触球，${cityShotTotal} 次射门里 ${shots.inside_box} 次在禁区内。${shots.inside_box >= Math.max(1, cityShotTotal * 0.7) ? '人和球都进得去，最后一脚才是最拖后腿的地方。' : '球到了前场，真正把进攻做到禁区里的次数还是不够。'}`
    : `曼城有 ${boxTouches} 次禁区触球和 ${cityShotTotal} 次射门。射门位置没留下来，这里只看总量。`;
  const chanceParagraph = hasXg && shots.available
    ? `曼城做出 ${xg.toFixed(2)} xG，其中运动战和反击是 ${shots.open_play_xg.toFixed(2)}，定位球是 ${shots.set_piece_xg.toFixed(2)}。${shots.high_quality ? `其中 ${shots.high_quality} 脚的单次 xG 不低于 0.30。` : ''}`
    : `曼城有 ${cityShotTotal} 次射门、${bigChances} 次绝佳机会。`;
  const finishParagraph = conversionGap > 0
    ? `${bigChances} 次绝佳机会只进 ${cityScore} 个。机会已经做出来，最后一脚没有处理好，这是球员执行问题。`
    : hasXg && xgLead >= 0.7
      ? '机会优势是真实的，进攻安排基本达到了目的。'
      : '球权不少，真正能让对手门将难受的机会却没有跟着涨。';
  const opponentOpenPlayXg = Number(opponentShots.open_play_xg || 0);
  const opponentSetPieceXg = Number(opponentShots.set_piece_xg || 0);
  let defensiveCause = '对手的威胁来源比较分散。';
  if (opponentOpenPlayXg >= 0.8) defensiveCause = `对手光靠运动战和反击就做出 ${opponentOpenPlayXg.toFixed(2)} xG。前场压迫一旦被过，中场身后的保护就露了出来。`;
  else if (opponentSetPieceXg >= 0.5) defensiveCause = `对手在定位球上做出 ${opponentSetPieceXg.toFixed(2)} xG，盯人和第二点保护是主要漏洞。`;
  const defensiveParagraph = `${opponentName}有 ${opponentShotTotal} 次射门、${opponentBoxTouches} 次禁区触球${hasXg ? `和 ${opponentXg.toFixed(2)} xG` : ''}。${defensiveCause}`;
  const keeperParagraph = keeperSaves
    ? `门将做了 ${keeperSaves} 次扑救。后场没能提前把危险化解，问题要从整条防守结构往前找。`
    : '门将没有被迫反复救险，防守结构至少守住了最后一层。';
  const substitutions = substitutionReview({ coachName, lineup, shots, opponentShots });
  const coachFaults = [];
  if (possession >= 65 && (!hasXg || xgLead < 1)) coachFaults.push('控球很多，进攻却没有把对手两条线持续拉开，这是结构问题');
  if (opponentOpenPlayXg >= 0.8) coachFaults.push('丢球后的中路和身后保护不够，这是布置问题');
  else if (opponentSetPieceXg >= 0.5) coachFaults.push('定位球盯人和第二点保护没做好，这是训练和布置问题');
  else if (opponentBigChances >= 3) coachFaults.push('禁区保护让对手拿到太多大机会，这是防守安排的问题');
  if (firstTacticalSub && firstTacticalSub.minute >= 65 && quietBeforeFirstSub?.xg < 0.3) coachFaults.push('场面发闷以后换得偏晚，这是临场问题');
  const coachReview = coachFaults.length
    ? `${coachName}需要改的地方很清楚：${coachFaults.join('；')}。`
    : `${coachName}这场的开场方案和临场处理没有暴露明显硬伤。`;
  const playerReview = conversionGap > 0
    ? `球员执行同样有问题：${bigChances} 次绝佳机会只进 ${cityScore} 个，战术已经把机会做出来，最后一下仍要由球员完成。`
    : '球员把主要机会兑现了，结果和场面基本对得上。';
  const finalLine = cityScore > opponentScore
    ? `${cityScore}-${opponentScore}赢了，但下一场如果还是让对手拿到 ${opponentBigChances} 次绝佳机会，未必还能这么收场。`
    : `${cityScore}-${opponentScore}已经把问题写在比分上：只拿球不够，得让阵型更快把球送进真正危险的地方。`;
  const xgGapText = hasXg
    ? xgLead >= 0 ? `xG 只领先 ${xgLead.toFixed(2)}` : `xG 反而落后 ${Math.abs(xgLead).toFixed(2)}`
    : '高质量机会仍然有限';
  const possessionParagraph = `曼城最后拿到 ${possession}% 控球，完成 ${accuratePasses} 次准确传球${passAccuracy === null ? '' : `，成功率 ${passAccuracy}%`}。球大部分时间在曼城脚下，${xgGapText}，控球没有压成决定性的机会优势。`;
  const phaseZoneParagraph = attackingZones.city?.first_half && attackingZones.city?.second_half
    ? `上下半场的落点也变了：上半场左路占 ${attackingZones.city.first_half.left}%、中路 ${attackingZones.city.first_half.center}%；下半场左路降到 ${attackingZones.city.second_half.left}%，中路升到 ${attackingZones.city.second_half.center}%。球队后来更想从中间解决问题，但射门质量没有立刻跟上。`
    : null;
  const stalledWindowParagraph = firstTacticalSub && quietBeforeFirstSub
    ? `下半场开局，46分钟到第一次主动换人的 ${firstTacticalSub.minute} 分钟，曼城只有 ${quietBeforeFirstSub.shots} 次射门、${quietBeforeFirstSub.xg.toFixed(2)} xG。球队能够推进到前场，控球却停在外围，没能连续变成真正的机会。`
    : null;
  const nextSteps = [];
  if (formationContext) {
    nextSteps.push(`继续让安德森和恩佐搭档，就要明确一个人向前接应时，另一个人留在球后。这样既能让谢尔基靠近哈兰德，也能避免一次传球失误就把中路完全让出来。`);
  } else if (possession >= 65 && (!hasXg || xgLead < 1)) {
    nextSteps.push(`第一步是让中场和边路的接应点错开。边锋拉住宽度，前腰站到对方中场身后，边后卫再决定套边还是留在球后；继续把三个人放在同一条边线上，只会让控球越来越安全、进攻越来越慢。`);
  } else if (opponentOpenPlayXg >= 0.8 || opponentBigChances >= 3) {
    nextSteps.push(`第一步是把球后的保护补齐。一个中场前插时，另一个人要守住中路，至少留三名后场球员应付第一脚反击，不能让对手一过中线就直接面对中卫。`);
  } else {
    nextSteps.push(`下一场先保留这一场运转顺畅的开场结构，同时把前15分钟的向前传球、丢球后反抢和弱侧接应作为重点。对手一旦换了压迫方式，场上站位也要跟着调。`);
  }
  if (firstTacticalSub && firstTacticalSub.minute >= 65 && quietBeforeFirstSub?.xg < 0.3) {
    nextSteps.push(`第二个要改的是反应速度。下半场十分钟左右如果射门和禁区触球明显掉下去，就该先调站位，或者更早换上福登；等到 ${firstTacticalSub.minute} 分钟才动，留给调整起效的时间太少。`);
  }
  if (opponentSetPieceXg >= 0.5) {
    const setPieceOrder = nextSteps.length >= 2 ? '第三个' : '另一个';
    nextSteps.push(`${setPieceOrder}是定位球。对手靠定位球做出 ${opponentSetPieceXg.toFixed(2)} xG，这不是一次偶然漏人就能解释的。第一点由谁顶、第二点由谁收、解围后谁先压出去，都需要重新分清。`);
  }
  const openingParagraphs = [
    formationLine,
    ...(editorialContext.lineup_change ? [editorialContext.lineup_change] : []),
    ...(roles ? [roles] : []),
    ...(matchupParagraph ? [matchupParagraph] : []),
    possessionParagraph,
  ];
  const buildUpParagraphs = [
    ...(editorialContext.goal_sequence ? [editorialContext.goal_sequence] : []),
    zoneParagraph,
    ...(phaseZoneParagraph ? [phaseZoneParagraph] : []),
    boxParagraph,
  ];
  const attackParagraphs = [
    ...(stalledWindowParagraph ? [stalledWindowParagraph] : []),
    chanceParagraph,
    finishParagraph,
  ];
  const defensiveParagraphs = [
    ...(editorialContext.early_risk ? [editorialContext.early_risk] : []),
    defensiveParagraph,
    keeperParagraph,
  ];
  const sections = [
    {
      heading: `一、先把${coachName}的开场站位说清`,
      paragraphs: openingParagraphs,
    },
    {
      heading: editorialContext.goal_sequence ? '二、进球是怎么打出来的，这套站位想要什么' : '二、出球和推进：球到底送到了哪儿',
      paragraphs: buildUpParagraphs,
    },
    {
      heading: '三、进攻为什么会卡住',
      paragraphs: attackParagraphs,
    },
    {
      heading: '四、无球和转换：危险从哪儿来',
      paragraphs: defensiveParagraphs,
    },
    {
      heading: `五、换人复盘：${coachName}动得早不早，换完有没有用`,
      paragraphs: substitutions,
    },
  ];
  if (nextSteps.length) {
    sections.push({
      heading: `六、下一场，${coachName}具体该改什么`,
      paragraphs: nextSteps,
    });
  }
  sections.push({
    heading: `${nextSteps.length ? '七' : '六'}、最后总结：教练布置和球员执行分开看`,
    paragraphs: [coachReview, playerReview, finalLine],
  });
  return {
    version: TACTICAL_LONGFORM_VERSION,
    title,
    standfirst: formationContext
      ? `先把 4-2-3-1 和 4-1-4-1 的争议说清，再看进球怎么打出来、下半场为什么卡住，以及换人到底有没有用。`
      : `从开场站位讲起，再看进攻路线、防守漏洞和换人效果。`,
    problems: problems.slice(0, 4),
    sections,
    sources: lineup.context_sources || [],
    source_note: formationContext
      ? '阵型核对：FotMob、FOX Sports。首发变动与关键回合：曼城官方战报。'
      : '比赛数据：FotMob。',
  };
}

function upgradeStoredTacticalLongform(match, force = false) {
  if (!force && match?.tactical_longform?.version === TACTICAL_LONGFORM_VERSION) return match;
  if (!match?.tactical_longform?.sections?.length) return match;
  const stats = {};
  for (const item of match.stats || []) stats[item.key] = [item.city, item.opponent];
  const oldText = (match.tactical_longform.sections || []).flatMap((section) => section.paragraphs || []).join(' ');
  const passMatch = oldText.match(/完成\s*([\d,]+)\s*次准确传球(?:，(?:传球)?成功率\s*([\d.]+)%)?/);
  if (passMatch) stats.accurate_passes = [`${passMatch[1]}${passMatch[2] ? ` (${passMatch[2]}%)` : ''}`, null];
  const keeperSaves = numeric(oldText.match(/门将(?:完成|做了)\s*(\d+)\s*次扑救/)?.[1]) || 0;
  const tacticalData = match.tactical_data || {};
  const lineup = addMatchTacticalContext(
    tacticalData.lineup || { city_starting_xi: [], city_substitutions: undefined },
    match.id,
  );
  const longform = buildTacticalLongform({
    opponentName: match.opponent?.name || '对手',
    cityScore: Number(match.city?.score || 0),
    opponentScore: Number(match.opponent?.score || 0),
    cityIndex: 0,
    stats,
    goals: match.goals || [],
    keeperSaves,
    lineup,
    shots: tacticalData.shots || { available: false, timeline: [] },
    opponentShots: tacticalData.opponent_shots || { available: false, timeline: [] },
    attackingZones: tacticalData.attacking_zones || {},
  });
  return {
    ...match,
    tactical_data: {
      ...tacticalData,
      lineup,
    },
    tactical_longform: longform,
  };
}

async function rebuildStoredLongforms() {
  const previous = await readJsonFile(OUTPUT_PATH);
  if (!previous?.matches?.length) throw new Error('No stored first-team analysis to rebuild');
  const matches = previous.matches.map((match) => upgradeStoredTacticalLongform(match, true));
  await writeFile(OUTPUT_PATH, `${JSON.stringify({
    ...previous,
    generated_at: new Date().toISOString(),
    provider: {
      ...(previous.provider || {}),
      note: PROVIDER_NOTE,
    },
    matches,
  }, null, 2)}\n`, 'utf8');
  console.log(`Rebuilt ${matches.length} stored tactical longforms without provider requests`);
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
  const matchId = String(fixture?.id || details?.general?.matchId || details?.content?.matchFacts?.matchId || '');
  const lineup = addMatchTacticalContext(lineupSnapshot(details, cityIndex), matchId);
  const shots = summariseShots(details, cityTeam.id);
  const opponentShots = summariseShots(details, opponentTeam.id);
  const attackingZones = attackZoneSnapshot(details, cityIndex);
  const tacticalLongform = buildTacticalLongform({
    opponentName: teamZh(opponentTeam.name),
    cityScore,
    opponentScore,
    cityIndex,
    stats,
    goals,
    keeperSaves,
    lineup,
    shots,
    opponentShots,
    attackingZones,
  });
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
    id: matchId,
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
    tactical_data: { lineup, shots, opponent_shots: opponentShots, attacking_zones: attackingZones },
    tactical_longform: tacticalLongform,
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
  if (previousMatch.tactical_longform?.version !== TACTICAL_LONGFORM_VERSION || !previousMatch.tactical_longform?.sections?.length) return true;
  if (!Array.isArray(previousMatch.tactical_data?.lineup?.city_substitutions)) return true;
  if (previousMatch.tactical_longform?.sections?.length && previousMatch.top_players?.length && previousMatch.stats?.length) return false;
  const kickoffAge = now.getTime() - new Date(fixture?.status?.utcTime).getTime();
  const checkedAge = now.getTime() - new Date(previousMatch.analysed_at || 0).getTime();
  return kickoffAge < 72 * 60 * 60 * 1000 && checkedAge >= 3 * 60 * 60 * 1000;
}

export async function buildFirstTeamAnalysisData({ now = new Date() } = {}) {
  const previous = await loadPrevious();
  const budget = createBudget(previous, now);
  const previousById = new Map((previous?.matches || []).map(upgradeStoredTacticalLongform).map((match) => [String(match.id), match]));
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
      note: PROVIDER_NOTE,
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
  const run = process.argv.includes('--rebuild-stored') ? rebuildStoredLongforms : main;
  run().catch(async (error) => {
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
