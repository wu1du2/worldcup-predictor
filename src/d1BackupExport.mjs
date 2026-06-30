export function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function sqlNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : 'NULL';
}

export function sqlInteger(value) {
  if (value === true) return '1';
  if (value === false) return '0';
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.trunc(number)) : 'NULL';
}

export function toJsonText(value) {
  return sqlString(JSON.stringify(value ?? null));
}

export function buildD1SeedSqlFromBackupTables({ tables }) {
  const statements = [
    'pragma foreign_keys = off;',
    ...deleteStatements(),
    ...insertGroups(tables.groups || []),
    ...insertPlayers(tables.players || []),
    ...insertPredictions(tables.predictions || []),
    ...insertMatches(tables.matches || []),
    ...insertScoreOdds(tables.score_odds || []),
    ...insertScoreOddsTrends(tables.score_odds_trends || []),
    ...insertAiRecommendations(tables.ai_recommendations || []),
    ...insertAiStrategyStats(tables.ai_strategy_stats || []),
    ...insertImportReports(tables.import_reports || []),
    'pragma foreign_keys = on;',
  ];
  return `${statements.join('\n')}\n`;
}

function deleteStatements() {
  return [
    'delete from import_reports;',
    'delete from ai_strategy_stats;',
    'delete from ai_recommendations;',
    'delete from score_odds_trends;',
    'delete from score_odds;',
    'delete from matches;',
    'delete from predictions;',
    'delete from players;',
    'delete from groups;',
  ];
}

function insertGroups(rows) {
  return rows
    .filter((row) => row.id && row.code)
    .map((row) => insert('groups', ['id', 'code', 'name', 'created_at'], [
      sqlString(row.id),
      sqlString(row.code),
      sqlString(row.name || row.code),
      sqlString(row.created_at),
    ]));
}

function insertPlayers(rows) {
  return rows
    .filter((row) => row.id && row.group_id && row.name)
    .map((row) => insert('players', ['id', 'group_id', 'name', 'created_at'], [
      sqlString(row.id),
      sqlString(row.group_id),
      sqlString(row.name),
      sqlString(row.created_at),
    ]));
}

function insertPredictions(rows) {
  return rows
    .filter((row) => row.id && row.group_id && row.player_id && row.match_id)
    .map((row) => insert('predictions', ['id', 'group_id', 'player_id', 'match_id', 'scores', 'updated_at'], [
      sqlString(row.id),
      sqlString(row.group_id),
      sqlString(row.player_id),
      sqlString(row.match_id),
      toJsonText(Array.isArray(row.scores) ? row.scores.filter((score) => typeof score === 'string') : []),
      sqlString(row.updated_at),
    ]));
}

function insertMatches(rows) {
  return rows
    .filter((row) => row.match_code)
    .map((row) => insert('matches', [
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
      'status',
      'status_detail',
      'stage',
      'active',
      'updated_at',
    ], [
      sqlString(row.match_code),
      sqlString(row.match_date_cn || row.match_date),
      sqlString(row.time_cn),
      sqlString(row.kickoff_at_utc || row.kickoff_at),
      sqlString(row.home || row.home_team),
      sqlString(row.away || row.away_team),
      sqlString(row.home_cn || row.home_team_cn),
      sqlString(row.away_cn || row.away_team_cn),
      sqlInteger(row.home_score),
      sqlInteger(row.away_score),
      sqlString(row.status),
      sqlString(row.status_detail),
      sqlString(row.stage),
      sqlInteger(row.active !== false),
      sqlString(row.updated_at),
    ]));
}

function insertScoreOdds(rows) {
  return rows
    .filter((row) => row.id && row.source && row.source_match_key && row.score)
    .map((row) => insert('score_odds', [
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
    ], [
      sqlString(row.id),
      sqlString(row.source),
      sqlString(row.source_match_key),
      sqlString(row.home),
      sqlString(row.away),
      sqlString(row.kickoff_label),
      sqlString(row.score),
      sqlNumber(row.odds),
      sqlString(row.kickoff_at_cn),
      sqlString(row.updated_at),
      sqlString(row.created_at),
    ]));
}

function insertScoreOddsTrends(rows) {
  return rows
    .filter((row) => row.id && row.source && row.source_match_key && row.score)
    .map((row) => insert('score_odds_trends', [
      'id',
      'source',
      'source_match_key',
      'home',
      'away',
      'kickoff_label',
      'score',
      'first_odds',
      'latest_odds',
      'change_pct',
      'first_seen_at',
      'latest_seen_at',
      'snapshots_count',
      'kickoff_at_cn',
      'updated_at',
      'created_at',
    ], [
      sqlString(row.id),
      sqlString(row.source),
      sqlString(row.source_match_key),
      sqlString(row.home),
      sqlString(row.away),
      sqlString(row.kickoff_label),
      sqlString(row.score),
      sqlNumber(row.first_odds),
      sqlNumber(row.latest_odds),
      sqlNumber(row.change_pct),
      sqlString(row.first_seen_at),
      sqlString(row.latest_seen_at),
      sqlInteger(row.snapshots_count),
      sqlString(row.kickoff_at_cn),
      sqlString(row.updated_at),
      sqlString(row.created_at),
    ]));
}

function insertAiRecommendations(rows) {
  return rows
    .filter((row) => row.match_id)
    .map((row) => insert('ai_recommendations', [
      'match_id',
      'scores',
      'score_labels',
      'strategy_id',
      'strategy_name',
      'strategy_roi',
      'strategy_roi_label',
      'strategy_feature',
      'router_reason',
      'match_reason_summary',
      'match_reason_detail',
      'prediction_summary',
      'context_version',
      'prediction_run_id',
      'predicted_at',
      'source_file',
      'created_at',
      'updated_at',
    ], [
      sqlString(row.match_id),
      toJsonText(Array.isArray(row.scores) ? row.scores : []),
      toJsonText(Array.isArray(row.score_labels) ? row.score_labels : []),
      sqlString(row.strategy_id),
      sqlString(row.strategy_name),
      sqlNumber(row.strategy_roi),
      sqlString(row.strategy_roi_label || ''),
      sqlString(row.strategy_feature || ''),
      sqlString(row.router_reason || ''),
      sqlString(row.match_reason_summary || ''),
      sqlString(row.match_reason_detail || ''),
      sqlString(row.prediction_summary || ''),
      sqlString(row.context_version),
      sqlString(row.prediction_run_id),
      sqlString(row.predicted_at),
      sqlString(row.source_file),
      sqlString(row.created_at),
      sqlString(row.updated_at),
    ]));
}

function insertAiStrategyStats(rows) {
  return rows
    .filter((row) => row.strategy_id)
    .map((row) => insert('ai_strategy_stats', [
      'strategy_id',
      'strategy_name',
      'matches_count',
      'cost',
      'revenue',
      'profit',
      'roi',
      'updated_at',
    ], [
      sqlString(row.strategy_id),
      sqlString(row.strategy_name || ''),
      sqlInteger(row.matches_count),
      sqlNumber(row.cost),
      sqlNumber(row.revenue),
      sqlNumber(row.profit),
      sqlNumber(row.roi),
      sqlString(row.updated_at),
    ]));
}

function insertImportReports(rows) {
  return rows
    .filter((row) => row.id)
    .map((row) => insert('import_reports', [
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
    ], [
      sqlString(row.id),
      sqlString(row.job_name),
      sqlString(row.status),
      sqlString(row.started_at),
      sqlString(row.finished_at),
      sqlInteger(row.rows_written),
      sqlInteger(row.items_seen),
      sqlString(row.message || ''),
      sqlString(row.error_detail || ''),
      sqlString(row.run_url || ''),
      sqlString(row.created_at),
    ]));
}

function insert(tableName, columns, values) {
  return `insert into ${tableName} (${columns.join(', ')}) values (${values.join(', ')});`;
}
