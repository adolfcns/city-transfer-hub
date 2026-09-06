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

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
}

function lineupSnapshot(details, cityIndex) {
  const lineup = details?.content?.lineup || {};
  const city = cityIndex === 0 ? lineup.homeTeam : lineup.awayTeam;
  const opponent = cityIndex === 0 ? lineup.awayTeam : lineup.homeTeam;
  const names = (team) => (team?.starters || []).map((player) => ({
    id: String(player.id || ''),
    name: playerZh(player.name),
    name_en: player.name || '',
  }));
  return {
    city_formation: city?.formation || '',
    opponent_formation: opponent?.formation || '',
    city_starting_xi: names(city),
    opponent_starting_xi: names(opponent),
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
  const title = possession >= 68 && Math.abs(cityScore - opponentScore) <= 1
    ? `${possession}%控球之下，曼城为何只与${opponentName}拉开一球？`
    : `从基础站位到攻防转换：曼城 ${cityScore}-${opponentScore} ${opponentName}`;
  const formationLine = lineup.city_formation
    ? `比赛阵容数据把曼城的基础阵型标为 ${lineup.city_formation}${lineup.opponent_formation ? `，${opponentName}则是 ${lineup.opponent_formation}` : ''}。`
    : '本场阵型标签尚未提供，因此不把具体站位变化写成既定事实。';
  const starterLine = lineup.city_starting_xi.length
    ? `曼城首发为${lineup.city_starting_xi.map((player) => player.name).join('、')}。`
    : '';
  const buildUpJudgement = possession >= 65
    ? '这说明曼城大部分时间拥有组织进攻的主动权，但高控球本身不等于持续制造高质量射门。'
    : '曼城没有依靠极端控球压住比赛，攻守转换与每一次向前推进的质量因而更加重要。';
  const chanceJudgement = conversionGap >= 2
    ? `真正的问题出在兑现：${bigChances} 次绝佳机会只换来 ${cityScore} 球，比赛本可更早失去悬念。`
    : hasXg && xg >= opponentXg + 0.7
      ? '从机会总量与质量看，曼城的优势不只停留在控球层面。'
      : hasXg
        ? '机会质量没有随球权同步拉开，控制感强于实际杀伤。'
        : bigChances >= 3
          ? '虽然缺少逐射门 xG，但绝佳机会数量仍能确认曼城制造了明确威胁。'
          : '缺少逐射门 xG 时，只能确认机会数量，不能把主观观感包装成精确的机会质量结论。';
  const defenceJudgement = opponentBigChances >= 3 || (hasXg && opponentXg >= 1.2)
    ? `对手仍拿到 ${opponentBigChances} 次绝佳机会${hasXg ? `和 ${opponentXg.toFixed(2)} xG` : ''}，这不是可以被比分掩盖的小波动，而是防守保护与转换落位需要复盘的警报。`
    : `对手只有 ${opponentBigChances} 次绝佳机会${hasXg ? `和 ${opponentXg.toFixed(2)} xG` : ''}，曼城无球阶段整体守住了危险区域。`;
  const halfShift = !shots.available
    ? '本场没有提供可可靠读取的逐射门 xG，因此不虚构上下半场威胁变化。'
    : shots.second_half.xg > shots.first_half.xg + 0.35
    ? `曼城下半场的射门 xG 从 ${shots.first_half.xg.toFixed(2)} 升至 ${shots.second_half.xg.toFixed(2)}，进攻质量在中场休息后有所提升。`
    : shots.first_half.xg > shots.second_half.xg + 0.35
      ? `曼城上半场已制造 ${shots.first_half.xg.toFixed(2)} xG，下半场只有 ${shots.second_half.xg.toFixed(2)}；后半程没有延续同等强度的机会产出。`
      : `曼城上下半场分别制造 ${shots.first_half.xg.toFixed(2)} 与 ${shots.second_half.xg.toFixed(2)} xG，威胁分布相对接近。`;
  const goalLine = goals.length
    ? `决定比分的节点是${goals.map((goal) => `${goal.minute} 分钟${goal.player}${goal.assist ? `接${goal.assist}助攻` : ''}破门`).join('，随后')}。`
    : '本场没有进球节点可以改变比赛状态。';
  const conclusion = cityScore > opponentScore
    ? `${cityScore}-${opponentScore}带来了结果，但这场球更重要的信号是：${hasXg && xg >= opponentXg + 0.7 ? '曼城已经建立机会优势，下一步要提高终结效率' : '曼城还需要把控球与推进更稳定地转化为安全的比赛结构'}。${hasXg && opponentXg >= 1.2 ? '若对手把握住其中一次高质量机会，比赛叙事就会完全不同。' : '只要继续压缩对手进入禁区的次数，这种控制才会真正稳定。'}`
    : `比分没有站在曼城一边。复盘重点不是简单增加控球，而是让推进更早抵达危险区域，同时在丢失球权后的第一时间保护中路与身后。`;
  return {
    version: 2,
    title,
    standfirst: `这不是战报复述，而是把阵型标签、进攻方向、射门位置、xG 与比赛节点放在一起，回答曼城怎样控制比赛、又在哪里留下风险。`,
    sections: [
      {
        heading: '一、基础站位：阵型只是起点',
        paragraphs: [
          `${formationLine}${starterLine}`,
          `曼城全场控球率达到 ${possession}%，完成 ${accuratePasses} 次准确传球${passAccuracy === null ? '' : `，传球成功率 ${passAccuracy}%`}。${buildUpJudgement}`,
        ],
      },
      {
        heading: '二、有球推进：球权主要去了哪里',
        paragraphs: [
          zoneText(attackingZones.city)
            ? `进攻方向分布为${zoneText(attackingZones.city)}。这组数据不能直接证明某名球员固定站在某个区域，却能说明球队把推进资源更多投向了哪里。`
            : '本场没有提供进攻方向分布，因此不根据印象猜测球队偏重哪一侧。',
          shots.available
            ? `曼城在对方禁区完成 ${boxTouches} 次触球，${cityShotTotal} 次射门中有 ${shots.inside_box} 次来自禁区内、${shots.outside_box} 次来自禁区外。评价推进是否有效，关键不是传了多少脚，而是球权最终有没有进入能够完成高价值射门的区域。`
            : `曼城在对方禁区完成 ${boxTouches} 次触球，全场共有 ${cityShotTotal} 次射门；射门位置图未提供，因此不进一步虚构禁区内外的分布。`,
        ],
      },
      {
        heading: '三、机会形成：控制有没有变成杀伤',
        paragraphs: [
          hasXg && shots.available
            ? `曼城累计 ${xg.toFixed(2)} xG，其中运动战与快速反击贡献约 ${shots.open_play_xg.toFixed(2)}，定位球贡献约 ${shots.set_piece_xg.toFixed(2)}；全场有 ${shots.high_quality} 次单次 xG 不低于 0.30 的高质量射门。`
            : `本场没有提供可可靠读取的逐射门 xG，因此这里不会用 0 冒充“没有威胁”；可以确认的是曼城完成 ${cityShotTotal} 次射门、${bigChances} 次绝佳机会。`,
          `${chanceJudgement}射正、绝佳机会和禁区触球必须放在一起看：单纯增加低质量远射，不会自动解决进攻效率。`,
        ],
      },
      {
        heading: '四、无球与转换：比分之外的风险',
        paragraphs: [
          opponentShots.available
            ? `${opponentName}完成 ${opponentShotTotal} 次射门，其中 ${opponentShots.inside_box} 次在禁区内；对手禁区触球 ${opponentBoxTouches} 次。${defenceJudgement}`
            : `${opponentName}完成 ${opponentShotTotal} 次射门、${opponentBoxTouches} 次禁区触球；对手射门位置图未提供。${defenceJudgement}`,
          `${keeperSaves ? `曼城门将完成 ${keeperSaves} 次扑救。` : ''}当最后一道防线需要频繁直接处理威胁时，问题通常不只属于门将或中卫，也要回看前场压迫被绕过后，中场是否及时保护第二点与禁区弧顶。`,
        ],
      },
      {
        heading: '五、比赛走势：优势何时出现、何时减弱',
        paragraphs: [
          `${halfShift}${goalLine}`,
          `比分变化会反过来影响两队风险偏好，因此赛后不能把全场均值当成九十分钟始终不变的战术状态。领先后的控球如果不能继续制造威胁，就可能从主动控制变成被动消耗。`,
        ],
      },
      {
        heading: '结论',
        paragraphs: [conclusion],
      },
    ],
    source_note: '本站中文战术复盘，根据 FotMob 展示的阵型、比赛事件、射门图与统计数据综合撰写；阵型标签与数据只能支持可观察的比赛现象，不冒充教练战术指令。',
  };
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
  const lineup = lineupSnapshot(details, cityIndex);
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
  if (previousMatch.tactical_longform?.version !== 2 || !previousMatch.tactical_longform?.sections?.length) return true;
  if (previousMatch.tactical_longform?.sections?.length && previousMatch.top_players?.length && previousMatch.stats?.length) return false;
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
      note: '比赛事实、评分、阵型标签、射门图及 xG 等来自 FotMob 展示的公开比赛数据；中文战术复盘由本站综合撰写，不代表 FotMob、Opta、俱乐部或教练组观点。',
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
