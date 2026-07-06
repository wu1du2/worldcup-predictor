import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

import { buildAiRecommendationRows } from '../src/aiPredictionSync.mjs';
import { toAppMatch } from '../src/matchSchedule.mjs';
import { deterministicUuid } from '../src/stableUuid.mjs';
import { runCandidateStrategyBacktests } from '../src/strategyCandidates.mjs';
import { attachMatchStrategyContexts } from '../src/strategyContextFiles.mjs';
import {
  buildForcedStrategyAiPredictionEntries,
  buildRoutedAiPredictionEntries,
} from '../src/strategyRouter.mjs';
import { mapScoreOddsByMatch } from '../src/supabaseData.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const fromDate = args.from || getChinaDate(new Date());
const outputPath = args.output || path.join(repoRoot, 'output', 'd1-ai-sync.sql');
const predictionDir = path.join(repoRoot, 'strategy_lab', 'predictions');

const tables = await loadD1Tables();
const matches = await attachMatchStrategyContexts({
  matches: (tables.matches || [])
    .filter((row) => Number(row.active) !== 0)
    .map(toAppMatch)
    .filter((match) => match.id && match.date && match.time && match.home && match.away)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
  matchInfoRoot: path.join(repoRoot, 'strategy_lab', 'match_info'),
});
const scoreOddsByMatch = mapScoreOddsByMatch(matches, tables.score_odds || [], tables.score_odds_trends || []);
const historicalResults = runCandidateStrategyBacktests({ matches, scoreOddsByMatch });
const targetMatches = matches
  .filter((match) => match.date >= fromDate)
  .filter((match) => match.status !== 'post')
  .filter((match) => (scoreOddsByMatch[match.id] || []).length > 0)
  .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

const entries = args.strategy
  ? buildForcedStrategyAiPredictionEntries({
    strategyId: args.strategy,
    matches: targetMatches,
    scoreOddsByMatch,
    historicalResults,
  })
  : buildRoutedAiPredictionEntries({
    matches: targetMatches,
    scoreOddsByMatch,
    historicalResults,
  });

if (!entries.length) throw new Error(`No active D1 matches found on or after ${fromDate}.`);

const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const predictionLog = buildPredictionLog({ fromDate, targetMatches, entries, historicalResults });
await mkdir(predictionDir, { recursive: true });
const predictionJsonPath = path.join(predictionDir, `strategy_router_d1_${runId}_prediction.json`);
const predictionReportPath = path.join(predictionDir, `strategy_router_d1_${runId}_report.md`);
await Promise.all([
  writeJson(predictionJsonPath, predictionLog),
  writeFile(predictionReportPath, formatPredictionReport(predictionLog), 'utf8'),
]);

const recommendationRows = buildAiRecommendationRows({
  predictionLog,
  scoreOddsByMatch,
  predictionRunId: runId,
  sourceFile: path.relative(repoRoot, predictionJsonPath),
});
const sql = buildD1AiSyncSql({
  groups: tables.groups || [],
  players: tables.players || [],
  entries,
  recommendationRows,
  historicalResults,
  now: new Date().toISOString(),
});

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, sql, 'utf8');

console.log(`From date: ${fromDate}`);
console.log(`Groups: ${(tables.groups || []).length}`);
console.log(`Target matches: ${targetMatches.length}`);
console.log(`Prediction log: ${predictionJsonPath}`);
console.log(`D1 AI sync SQL: ${outputPath}`);
for (const entry of entries) {
  console.log(`${entry.route.matchId} ${entry.route.match}: ${entry.scores.join(', ')} | ${entry.route.strategyName} ${entry.route.roiLabel}`);
}
console.log(`AI recommendation detail rows: ${recommendationRows.length}`);
console.log(`AI strategy stats rows: ${historicalResults.length}`);

function buildD1AiSyncSql({
  groups,
  players,
  entries,
  recommendationRows,
  historicalResults,
  now,
}) {
  const statements = [];
  const aiPlayersByGroupId = new Map(
    (players || [])
      .filter((player) => player.name === 'AI推荐')
      .map((player) => [player.group_id, player]),
  );

  for (const group of groups || []) {
    if (!group?.id) continue;
    const aiPlayer = aiPlayersByGroupId.get(group.id) || {
      id: deterministicUuid(`d1-ai-player:${group.id}`),
      group_id: group.id,
      name: 'AI推荐',
      created_at: now,
    };
    statements.push(`insert into players (id, group_id, name, created_at) values (${[
      sqlString(aiPlayer.id),
      sqlString(group.id),
      sqlString('AI推荐'),
      sqlString(aiPlayer.created_at || now),
    ].join(', ')}) on conflict(group_id, name) do nothing;`);

    for (const entry of entries) {
      statements.push(`insert into predictions (id, group_id, player_id, match_id, scores, updated_at) values (${[
        sqlString(deterministicUuid(`d1-ai-prediction:${group.id}:${entry.matchId}`)),
        sqlString(group.id),
        sqlString(aiPlayer.id),
        sqlString(entry.matchId),
        sqlJson(entry.scores),
        sqlString(now),
      ].join(', ')}) on conflict(group_id, player_id, match_id) do update set scores = excluded.scores, updated_at = excluded.updated_at;`);
    }
  }

  for (const row of recommendationRows || []) {
    statements.push(`insert into ai_recommendations (${[
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
    ].join(', ')}) values (${[
      sqlString(row.match_id),
      sqlJson(row.scores),
      sqlJson(row.score_labels),
      sqlString(row.strategy_id),
      sqlString(row.strategy_name),
      sqlNumber(row.strategy_roi),
      sqlString(row.strategy_roi_label || ''),
      sqlString(row.strategy_feature || ''),
      sqlString(row.router_reason || ''),
      sqlString(row.match_reason_summary || ''),
      sqlString(row.match_reason_detail || ''),
      sqlString(row.prediction_summary || ''),
      sqlString(row.context_version || ''),
      sqlString(row.prediction_run_id || ''),
      sqlString(row.predicted_at || now),
      sqlString(row.source_file || ''),
      sqlString(now),
      sqlString(now),
    ].join(', ')}) on conflict(match_id) do update set
  scores = excluded.scores,
  score_labels = excluded.score_labels,
  strategy_id = excluded.strategy_id,
  strategy_name = excluded.strategy_name,
  strategy_roi = excluded.strategy_roi,
  strategy_roi_label = excluded.strategy_roi_label,
  strategy_feature = excluded.strategy_feature,
  router_reason = excluded.router_reason,
  match_reason_summary = excluded.match_reason_summary,
  match_reason_detail = excluded.match_reason_detail,
  prediction_summary = excluded.prediction_summary,
  context_version = excluded.context_version,
  prediction_run_id = excluded.prediction_run_id,
  predicted_at = excluded.predicted_at,
  source_file = excluded.source_file,
  updated_at = excluded.updated_at;`);
  }

  statements.push('delete from ai_strategy_stats;');
  for (const result of historicalResults || []) {
    statements.push(`insert into ai_strategy_stats (strategy_id, strategy_name, matches_count, cost, revenue, profit, roi, updated_at) values (${[
      sqlString(deterministicUuid(`system:${result.strategyId}`)),
      sqlString(result.strategyName || ''),
      sqlInteger(result.settledMatches),
      sqlNumber(result.cost),
      sqlNumber(result.revenue),
      sqlNumber(result.netProfit),
      sqlNumber(result.roiPercent),
      sqlString(now),
    ].join(', ')});`);
  }

  return `${statements.join('\n')}\n`;
}

async function loadD1Tables() {
  const [matches, scoreOdds, scoreOddsTrends, groups, players] = await Promise.all([
    d1Select(`select match_code, match_date_cn, time_cn, kickoff_at_utc, home, away, home_cn, away_cn, home_score, away_score, settlement_home_score, settlement_away_score, settlement_score_source, status, status_detail, stage, active, updated_at from matches order by match_date_cn, time_cn`),
    d1Select('select id, source, source_match_key, home, away, kickoff_label, score, odds, kickoff_at_cn, updated_at, created_at from score_odds order by kickoff_at_cn, source_match_key, score'),
    d1Select('select id, source, source_match_key, home, away, kickoff_label, score, first_odds, latest_odds, change_pct, snapshots_count, kickoff_at_cn, updated_at, created_at from score_odds_trends order by kickoff_at_cn, source_match_key, score'),
    d1Select('select id, code, name, created_at from groups order by code'),
    d1Select('select id, group_id, name, created_at from players order by group_id, created_at'),
  ]);
  return {
    matches,
    score_odds: scoreOdds,
    score_odds_trends: scoreOddsTrends,
    groups,
    players,
  };
}

async function d1Select(command) {
  const { stdout } = await execFileAsync('npx', [
    '--yes',
    'wrangler@4.106.0',
    'd1',
    'execute',
    'worldcup-predictor',
    '--remote',
    '--json',
    '--command',
    command,
  ], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 32,
  });
  const parsed = JSON.parse(stdout);
  return parsed?.[0]?.results || [];
}

function buildPredictionLog({ fromDate, targetMatches, entries, historicalResults }) {
  const entriesByMatchId = new Map(entries.map((entry) => [entry.matchId, entry]));
  return {
    schemaVersion: 1,
    strategy_router: args.strategy ? `forced_${args.strategy}` : 'rolling_roi_market_router_v1',
    generatedAt: new Date().toISOString(),
    fromDate,
    historicalSummary: historicalResults.map((result) => ({
      strategyId: result.strategyId,
      strategyName: result.strategyName,
      settledMatches: result.settledMatches,
      roiPercent: result.roiPercent,
      netProfit: result.netProfit,
      hitMatches: result.hitMatches,
    })),
    predictions: targetMatches.map((match) => {
      const entry = entriesByMatchId.get(match.id);
      return {
        matchId: match.id,
        date: match.date,
        time: match.time,
        home: match.home,
        away: match.away,
        contextQuality: match.strategyContext?.context_quality || 'none',
        contextSources: {
          accepted: match.strategyContext?.sourceGate?.accepted_source_ids?.length || 0,
          weak: match.strategyContext?.sourceGate?.weak_source_ids?.length || 0,
        },
        scores: entry.scores,
        pickDetails: entry.pickDetails || [],
        route: entry.route,
      };
    }),
  };
}

function formatPredictionReport(log) {
  const lines = [
    '# D1 Strategy Router AI Predictions',
    '',
    `Generated at: ${log.generatedAt}`,
    `From date: ${log.fromDate}`,
    `Router: ${log.strategy_router}`,
    '',
    '## Predictions',
    '',
  ];

  for (const item of log.predictions) {
    lines.push(`- ${item.date} ${item.time} ${item.home} vs ${item.away}: ${item.scores.join(', ')} | ${item.route.strategyName} ${item.route.roiLabel} | context ${item.contextQuality}`);
    lines.push(`  - ${item.route.reason}`);
  }

  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    parsed[key] = value || true;
  }
  return parsed;
}

function getChinaDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function sqlJson(value) {
  return sqlString(JSON.stringify(value || []));
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
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.trunc(number)) : 'NULL';
}

function writeJson(filePath, value) {
  return writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
