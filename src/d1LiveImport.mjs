export { buildLiveDateWindow } from './liveWindow.mjs';

export function normalizeLiveComparable({ matches = [], scoreOddsRows = [], scoreOddsByMatch = {} } = {}) {
  const normalizedMatches = (matches || [])
    .map(normalizeComparableMatch)
    .filter((match) => match.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  const matchIdByOddsKey = new Map(normalizedMatches.map((match) => [
    buildOddsMatchKey(match.home, match.away, `${String(match.date || '').slice(5)} ${match.time}`),
    match.id,
  ]));

  const oddsFromRows = (scoreOddsRows || []).map((row) => ({
    matchId: matchIdByOddsKey.get(buildOddsMatchKey(row.home, row.away, row.kickoff_label)) || '',
    score: row.score,
    odds: Number(row.odds),
  }));
  const oddsFromMap = Object.entries(scoreOddsByMatch || {}).flatMap(([matchId, options]) => (
    (options || []).map((option) => ({
      matchId,
      score: option.score,
      odds: Number(option.odds),
    }))
  ));

  return {
    matches: normalizedMatches,
    odds: [...oddsFromRows, ...oddsFromMap]
      .filter((row) => row.matchId && row.score && Number.isFinite(row.odds))
      .sort((a, b) => `${a.matchId}|${a.score}`.localeCompare(`${b.matchId}|${b.score}`)),
  };
}

export function hasLiveWindowChanged(current, next) {
  return stableStringify(current) !== stableStringify(next);
}

export function buildD1LiveImportSql({
  matches = [],
  scoreOddsRows = [],
  report = {},
} = {}) {
  const statements = [
    ...matches.map(matchUpsertSql),
    ...scoreOddsRows.map(scoreOddsUpsertSql),
    importReportInsertSql(report),
  ].filter(Boolean);
  return `${statements.join('\n')}\n`;
}

function normalizeComparableMatch(row) {
  return {
    id: row.match_code || row.matchCode || row.id || '',
    date: row.match_date_cn || row.date || '',
    time: row.time_cn || row.time || '',
    home: row.home_cn || row.home || '',
    away: row.away_cn || row.away || '',
    homeScore: normalizeNullableInteger(row.home_score ?? row.homeScore),
    awayScore: normalizeNullableInteger(row.away_score ?? row.awayScore),
    settlementHomeScore: normalizeNullableInteger(row.settlement_home_score ?? row.settlementHomeScore),
    settlementAwayScore: normalizeNullableInteger(row.settlement_away_score ?? row.settlementAwayScore),
    settlementScoreSource: row.settlement_score_source ?? row.settlementScoreSource ?? '',
    status: row.status || 'pre',
    statusDetail: row.status_detail || row.statusDetail || '',
    stage: row.stage || '',
  };
}

function matchUpsertSql(row) {
  const values = [
    sqlString(row.match_code),
    sqlString(row.match_date_cn),
    sqlString(row.time_cn),
    sqlString(row.kickoff_at_utc),
    sqlString(row.home),
    sqlString(row.away),
    sqlString(row.home_cn),
    sqlString(row.away_cn),
    sqlInteger(row.home_score),
    sqlInteger(row.away_score),
    sqlInteger(row.settlement_home_score),
    sqlInteger(row.settlement_away_score),
    sqlString(row.settlement_score_source || ''),
    sqlString(row.status || 'pre'),
    sqlString(row.status_detail || ''),
    sqlString(row.stage || ''),
    sqlInteger(row.active !== false),
    sqlString(row.updated_at || new Date().toISOString()),
  ];
  return `insert into matches (${[
    'match_code',
    'match_date_cn',
    'time_cn',
    'kickoff_at_utc',
    'home',
    'away',
    'home_cn',
    'away_cn',
    'home_score',
    'away_score',
    'settlement_home_score',
    'settlement_away_score',
    'settlement_score_source',
    'status',
    'status_detail',
    'stage',
    'active',
    'updated_at',
  ].join(', ')}) values (${values.join(', ')})
on conflict(match_code) do update set
  match_date_cn = excluded.match_date_cn,
  time_cn = excluded.time_cn,
  kickoff_at_utc = excluded.kickoff_at_utc,
  home = excluded.home,
  away = excluded.away,
  home_cn = excluded.home_cn,
  away_cn = excluded.away_cn,
  home_score = excluded.home_score,
  away_score = excluded.away_score,
  settlement_home_score = excluded.settlement_home_score,
  settlement_away_score = excluded.settlement_away_score,
  settlement_score_source = excluded.settlement_score_source,
  status = excluded.status,
  status_detail = excluded.status_detail,
  stage = excluded.stage,
  active = excluded.active,
  updated_at = excluded.updated_at;`;
}

function scoreOddsUpsertSql(row) {
  const id = row.id || `score_odds:${row.source}:${row.source_match_key}:${row.score}`;
  return `insert into score_odds (${[
    'id',
    'source',
    'source_match_key',
    'home',
    'away',
    'kickoff_label',
    'score',
    'odds',
    'kickoff_at_cn',
    'updated_at',
    'created_at',
  ].join(', ')}) values (${[
    sqlString(id),
    sqlString(row.source),
    sqlString(row.source_match_key),
    sqlString(row.home),
    sqlString(row.away),
    sqlString(row.kickoff_label),
    sqlString(row.score),
    sqlNumber(row.odds),
    sqlString(row.kickoff_at_cn),
    sqlString(row.updated_at),
    sqlString(row.created_at || row.updated_at),
  ].join(', ')})
on conflict(source, source_match_key, score) do update set
  home = excluded.home,
  away = excluded.away,
  kickoff_label = excluded.kickoff_label,
  odds = excluded.odds,
  kickoff_at_cn = excluded.kickoff_at_cn,
  updated_at = excluded.updated_at;`;
}

function importReportInsertSql(report) {
  if (!report?.id) return '';
  return `insert into import_reports (${[
    'id',
    'job_name',
    'status',
    'started_at',
    'finished_at',
    'rows_written',
    'items_seen',
    'message',
    'error_detail',
    'run_url',
    'created_at',
  ].join(', ')}) values (${[
    sqlString(report.id),
    sqlString(report.jobName || 'live-d1'),
    sqlString(report.status || 'success'),
    sqlString(report.startedAt),
    sqlString(report.finishedAt),
    sqlInteger(report.rowsWritten),
    sqlInteger(report.itemsSeen),
    sqlString(report.message || ''),
    sqlString(report.errorDetail || ''),
    sqlString(report.runUrl || ''),
    sqlString(report.createdAt || report.finishedAt),
  ].join(', ')});`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function buildOddsMatchKey(home, away, kickoffLabel) {
  return `${home}|${away}|${kickoffLabel}`;
}

function normalizeNullableInteger(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function getChinaDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addChinaDateDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return getChinaDate(date);
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : 'NULL';
}

function sqlInteger(value) {
  if (value === null || value === undefined) return 'NULL';
  if (value === true) return '1';
  if (value === false) return '0';
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.trunc(number)) : 'NULL';
}
