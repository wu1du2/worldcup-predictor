import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { buildAiRecommendationRows } from '../src/aiPredictionSync.mjs';
import { runCandidateStrategyBacktests } from '../src/strategyCandidates.mjs';
import { attachMatchStrategyContexts } from '../src/strategyContextFiles.mjs';
import {
  buildForcedStrategyAiPredictionEntries,
  buildRoutedAiPredictionEntries,
} from '../src/strategyRouter.mjs';
import {
  ensureAiPlayer,
  getGroupByCode,
  loadMatches,
  loadScoreOdds,
  saveGroupPredictions,
  upsertAiRecommendations,
} from '../src/supabaseData.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await loadLocalEnv();

const args = parseArgs(process.argv.slice(2));
const fromDate = args.from || '2026-06-24';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
}

const client = createClient(supabaseUrl, supabaseKey);
const groups = args.group
  ? [await getGroupByCode({ client, groupCode: args.group })]
  : await loadAllGroups(client);
const matches = await attachMatchStrategyContexts({
  matches: await loadMatches({ client }),
  matchInfoRoot: path.join(repoRoot, 'strategy_lab', 'match_info'),
});
const scoreOddsByMatch = await loadScoreOdds({ client, matches });
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

if (!groups.length) throw new Error('No groups found.');
if (!entries.length) throw new Error(`No active matches found on or after ${fromDate}.`);

const predictionLog = buildPredictionLog({ fromDate, targetMatches, entries, historicalResults });
const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const predictionDir = path.join(repoRoot, 'strategy_lab', 'predictions');
await mkdir(predictionDir, { recursive: true });
const predictionJsonPath = path.join(predictionDir, `strategy_router_${runId}_prediction.json`);
const predictionReportPath = path.join(predictionDir, `strategy_router_${runId}_report.md`);
await Promise.all([
  writeJson(predictionJsonPath, predictionLog),
  writeFile(predictionReportPath, formatPredictionReport(predictionLog), 'utf8'),
]);

console.log(`From date: ${fromDate}`);
console.log(`Groups: ${groups.length}`);
console.log(`Target matches: ${targetMatches.length}`);
console.log(`With odds: ${targetMatches.length}`);
if (args.strategy) console.log(`Forced strategy: ${args.strategy}`);
console.log(`Prediction log: ${predictionJsonPath}`);
const recommendationRows = buildAiRecommendationRows({
  predictionLog,
  scoreOddsByMatch,
  predictionRunId: runId,
  sourceFile: path.relative(repoRoot, predictionJsonPath),
});

for (const entry of entries) {
  console.log(`${entry.route.matchId} ${entry.route.match}: ${entry.scores.join(', ')} | ${entry.route.strategyName} ${entry.route.roiLabel}`);
}

for (const group of groups) {
  const aiPlayer = await withRetry(`ensure AI player for ${group.code}`, () => ensureAiPlayer({ client, groupId: group.id }));

  if (!args.dryRun) {
    await withRetry(`save AI predictions for ${group.code}`, () => saveGroupPredictions({
      client,
      groupId: group.id,
      playerId: aiPlayer.id,
      entries,
    }));
  }

  const coverage = args.dryRun
    ? { written: 0, missing: entries.map((entry) => entry.matchId) }
    : await withRetry(`verify AI prediction coverage for ${group.code}`, () => verifyAiPredictionCoverage({
      client,
      groupId: group.id,
      playerId: aiPlayer.id,
      entries,
    }));

  const label = `${group.code} (${group.id})`;
  if (coverage.missing.length) {
    console.log(`${label}: ${coverage.written}/${entries.length}, missing ${coverage.missing.length}`);
    if (!args.dryRun) {
      throw new Error(`AI prediction coverage incomplete for group ${group.code}: ${coverage.missing.join(', ')}`);
    }
  } else {
    console.log(`${label}: ${coverage.written}/${entries.length}`);
  }
}

if (args.dryRun) {
  console.log('Dry run only; no predictions were written.');
} else {
  await withRetry('upsert AI recommendation rows', () => upsertAiRecommendations({ client, rows: recommendationRows }));
  await withRetry('upsert built-in strategy stats', () => upsertBuiltInStrategyStats({ client, historicalResults }));
  console.log(`AI recommendation detail rows: ${recommendationRows.length}`);
  console.log(`AI strategy stats rows: ${historicalResults.length}`);
  console.log('Strategy-router AI predictions are complete for all selected groups.');
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
    '# Strategy Router AI Predictions',
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

async function loadAllGroups(client) {
  const pageSize = 1000;
  const groups = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('groups')
      .select('id,code,name')
      .order('code', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    groups.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return groups;
}

async function verifyAiPredictionCoverage({ client, groupId, playerId, entries }) {
  const matchIds = entries.map((entry) => entry.matchId);
  const { data, error } = await client
    .from('predictions')
    .select('match_id,scores')
    .eq('group_id', groupId)
    .eq('player_id', playerId)
    .in('match_id', matchIds);

  if (error) throw error;

  const rowsByMatchId = new Map((data || []).map((row) => [row.match_id, row]));
  const missing = [];

  for (const entry of entries) {
    const row = rowsByMatchId.get(entry.matchId);
    const scores = Array.isArray(row?.scores) ? row.scores : [];
    const hasEveryScore = entry.scores.every((score) => scores.includes(score));
    if (!hasEveryScore) missing.push(entry.matchId);
  }

  return {
    written: entries.length - missing.length,
    missing,
  };
}

async function upsertBuiltInStrategyStats({ client, historicalResults }) {
  const strategyRows = historicalResults.map((result) => ({
    id: deterministicUuid(`system:${result.strategyId}`),
    group_code: null,
    author_name: 'system',
    strategy_name: result.strategyName,
    strategy_prompt: result.description || result.strategyName,
    status: 'backtested',
    note: `内置策略 ${result.strategyId}`,
  }));
  const statsRows = historicalResults.map((result) => ({
    strategy_id: deterministicUuid(`system:${result.strategyId}`),
    strategy_name: result.strategyName,
    matches_count: result.settledMatches,
    cost: result.cost,
    revenue: result.revenue,
    profit: result.netProfit,
    roi: result.roiPercent,
    updated_at: new Date().toISOString(),
  }));

  const { error: strategyError } = await client
    .from('ai_user_strategies')
    .upsert(strategyRows, { onConflict: 'id' });
  if (strategyError) throw strategyError;

  const { error: statsError } = await client
    .from('ai_strategy_stats')
    .upsert(statsRows, { onConflict: 'strategy_id' });
  if (statsError) throw statsError;
}

async function withRetry(label, operation, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delayMs = 1000 * attempt;
      console.warn(`${label} failed on attempt ${attempt}/${attempts}; retrying in ${delayMs}ms: ${formatError(error)}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function formatError(error) {
  return error?.message || error?.details || String(error);
}

function deterministicUuid(value) {
  const hex = simpleHashHex(value).padEnd(32, '0').slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

function simpleHashHex(value) {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;
  for (const char of String(value)) {
    hashA ^= char.charCodeAt(0);
    hashA = Math.imul(hashA, 0x01000193) >>> 0;
    hashB ^= hashA;
    hashB = Math.imul(hashB, 0x85ebca6b) >>> 0;
  }
  const chunks = [hashA, hashB, hashA ^ hashB, Math.imul(hashA + hashB, 0xc2b2ae35) >>> 0];
  return chunks.map((chunk) => chunk.toString(16).padStart(8, '0')).join('');
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    const [key, value] = arg.replace(/^--/, '').split('=');
    parsed[key] = value;
  }
  return parsed;
}

async function loadLocalEnv() {
  try {
    const envText = await readFile(path.join(repoRoot, '.env.local'), 'utf8');
    for (const line of envText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      process.env[key] ||= valueParts.join('=');
    }
  } catch {
    // .env.local is optional.
  }
}

function writeJson(filePath, value) {
  return writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
