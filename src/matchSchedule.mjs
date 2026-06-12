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
    home: row.home,
    away: row.away,
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

  return {
    id: event.id,
    match_code: `espn-${event.id}`,
    kickoff_at_utc: kickoff.toISOString(),
    match_date_cn: getChinaDate(kickoff),
    time_cn: chinaClockFormatter.format(kickoff),
    home: getTeamName(home),
    away: getTeamName(away),
    home_score: normalizeScore(home.score, state),
    away_score: normalizeScore(away.score, state),
    status: state,
    status_detail: event.status?.type?.shortDetail || '',
    venue: formatVenue(competition?.venue),
    stage: 'Group Stage',
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
