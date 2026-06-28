const chinaTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const chinaClockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const teamNameCnByEnglish = {
  Argentina: '阿根廷',
  Australia: '澳大利亚',
  Austria: '奥地利',
  Belgium: '比利时',
  'Bosnia-Herzegovina': '波黑',
  Brazil: '巴西',
  'Cape Verde': '佛得角',
  Cameroon: '喀麦隆',
  Canada: '加拿大',
  Chile: '智利',
  Colombia: '哥伦比亚',
  'Congo DR': '刚果民主共和国',
  'Costa Rica': '哥斯达黎加',
  Croatia: '克罗地亚',
  Cuba: '古巴',
  Curaçao: '库拉索',
  Czechia: '捷克',
  Denmark: '丹麦',
  Ecuador: '厄瓜多尔',
  Egypt: '埃及',
  England: '英格兰',
  France: '法国',
  Germany: '德国',
  Ghana: '加纳',
  Haiti: '海地',
  Iran: '伊朗',
  Iraq: '伊拉克',
  Italy: '意大利',
  'Ivory Coast': '科特迪瓦',
  Jamaica: '牙买加',
  Japan: '日本',
  Jordan: '约旦',
  Mexico: '墨西哥',
  Morocco: '摩洛哥',
  Netherlands: '荷兰',
  'New Zealand': '新西兰',
  Nigeria: '尼日利亚',
  Norway: '挪威',
  Panama: '巴拿马',
  Paraguay: '巴拉圭',
  Peru: '秘鲁',
  Poland: '波兰',
  Portugal: '葡萄牙',
  Qatar: '卡塔尔',
  'Republic of Ireland': '爱尔兰',
  Romania: '罗马尼亚',
  'Saudi Arabia': '沙特阿拉伯',
  Scotland: '苏格兰',
  Senegal: '塞内加尔',
  Serbia: '塞尔维亚',
  Slovakia: '斯洛伐克',
  Slovenia: '斯洛文尼亚',
  'South Africa': '南非',
  'South Korea': '韩国',
  Spain: '西班牙',
  Sweden: '瑞典',
  Switzerland: '瑞士',
  Tunisia: '突尼斯',
  Turkey: '土耳其',
  Türkiye: '土耳其',
  Ukraine: '乌克兰',
  'United States': '美国',
  Uruguay: '乌拉圭',
  USA: '美国',
  Uzbekistan: '乌兹别克斯坦',
  Wales: '威尔士',
};

const stageLabelBySlug = {
  'group-stage': 'Group Stage',
  'round-of-32': 'Round of 32',
  'round-of-16': 'Round of 16',
  quarterfinals: 'Quarterfinals',
  semifinals: 'Semifinals',
  '3rd-place-match': 'Third-place Match',
  final: 'Final',
};

export function normalizeEspnScoreboard(scoreboard) {
  return (scoreboard.events || [])
    .map((event) => normalizeEspnEvent(event))
    .filter(Boolean)
    .sort((a, b) => a.kickoff_at_utc.localeCompare(b.kickoff_at_utc));
}

export function buildDateTabs(matches) {
  const countsByDate = new Map();

  for (const match of matches) {
    const date = match.match_date_cn || match.date;
    if (!date) continue;
    countsByDate.set(date, (countsByDate.get(date) || 0) + 1);
  }

  return [...countsByDate.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, count]) => ({
      date,
      label: formatChinaDateLabel(date),
      count,
    }));
}

export function getDefaultMatchDateCn(matches, now = new Date()) {
  const dates = [...new Set(matches.map((match) => match.match_date_cn || match.date).filter(Boolean))].sort();
  if (!dates.length) return '';

  const today = getChinaDate(now);
  return dates.find((date) => date >= today) || dates[dates.length - 1];
}

export function getNextMatchDateCn(matches, selectedDate) {
  const dates = [...new Set(matches.map((match) => match.match_date_cn || match.date).filter(Boolean))].sort();
  return dates.find((date) => date > selectedDate) || '';
}

export function formatChinaDateLabel(matchDateCn) {
  const [, month, day] = matchDateCn.split('-');
  return `${Number(month)}月${Number(day)}日`;
}

export function getMatchScoreText(match) {
  const homeScore = match.home_score ?? match.homeScore;
  const awayScore = match.away_score ?? match.awayScore;

  if (Number.isInteger(homeScore) && Number.isInteger(awayScore)) {
    return `${homeScore}-${awayScore}`;
  }

  if (match.status === 'post') return '完场';
  if (match.status === 'in') return '进行中';
  return '未开赛';
}

export function toAppMatch(row) {
  return {
    id: row.match_code || row.id,
    matchCode: row.match_code || row.id,
    date: row.match_date_cn,
    time: row.time_cn,
    home: row.home_team?.name_cn || row.home_cn || row.home,
    away: row.away_team?.name_cn || row.away_cn || row.away,
    homeScore: row.home_score,
    awayScore: row.away_score,
    status: row.status || 'pre',
    statusDetail: row.status_detail || '',
    venue: row.venue || '',
    stage: row.stage || '',
  };
}

export function toMatchUpsertRows(matches, updatedAt = new Date().toISOString()) {
  return matches.map(({ id, ...match }) => ({
    ...match,
    match_date: match.match_date_cn,
    kickoff_at: match.kickoff_at_utc,
    home_team: match.home,
    away_team: match.away,
    home_team_cn: match.home_cn,
    away_team_cn: match.away_cn,
    active: true,
    updated_at: updatedAt,
  }));
}

function normalizeEspnEvent(event) {
  const competition = event.competitions?.[0];
  const home = competition?.competitors?.find((competitor) => competitor.homeAway === 'home');
  const away = competition?.competitors?.find((competitor) => competitor.homeAway === 'away');
  const kickoff = new Date(event.date);

  if (!event.id || Number.isNaN(kickoff.valueOf()) || !home || !away) {
    return null;
  }

  const state = event.status?.type?.state || 'pre';

  const homeName = getTeamName(home);
  const awayName = getTeamName(away);

  if (isUnresolvedBracketName(homeName) || isUnresolvedBracketName(awayName)) {
    return null;
  }

  return {
    id: event.id,
    match_code: `espn-${event.id}`,
    kickoff_at_utc: kickoff.toISOString(),
    match_date_cn: getChinaDate(kickoff),
    time_cn: chinaClockFormatter.format(kickoff),
    home: homeName,
    away: awayName,
    home_cn: getTeamNameCn(homeName),
    away_cn: getTeamNameCn(awayName),
    home_score: normalizeScore(home.score, state),
    away_score: normalizeScore(away.score, state),
    status: state,
    status_detail: event.status?.type?.shortDetail || '',
    venue: formatVenue(competition?.venue),
    stage: getStageLabel(event),
    source: 'espn',
  };
}

function getChinaDate(date) {
  return chinaTimeFormatter.format(date);
}

function getTeamName(competitor) {
  if (typeof competitor.team === 'string') return competitor.team;
  return competitor.team?.displayName || competitor.team?.name || competitor.team?.abbreviation || '';
}

function getTeamNameCn(name) {
  return teamNameCnByEnglish[name] || name;
}

function getStageLabel(event) {
  const slug = event.season?.slug;
  return stageLabelBySlug[slug] || 'Group Stage';
}

function isUnresolvedBracketName(name) {
  return /\b(Winner|Loser)\b/.test(name);
}

function normalizeScore(score, state) {
  if (state === 'pre') return null;
  const parsed = Number(score);
  return Number.isInteger(parsed) ? parsed : null;
}

function formatVenue(venue) {
  const parts = [
    venue?.fullName,
    venue?.address?.city,
    venue?.address?.country,
  ].filter(Boolean);

  return parts.join(', ');
}
