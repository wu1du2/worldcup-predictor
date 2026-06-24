import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { toAppMatch } from '../src/matchSchedule.mjs';
import { candidateStrategies } from '../src/strategyCandidates.mjs';
import { routerCandidateStrategyIds } from '../src/strategyRouter.mjs';
import {
  defaultQualificationGate,
  enrichBacktestResult,
  generateTempStrategyCandidates,
  selectFinalThreeStrategies,
  selectQualifiedTopStrategies,
  serializeStrategyDefinition,
} from '../src/tempStrategyLab.mjs';
import { runCandidateStrategyBacktests } from '../src/strategyCandidates.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'strategy_lab', 'tem_strategy');

await loadLocalEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
}

const client = createClient(supabaseUrl, supabaseKey);
const [contexts, matchRows] = await Promise.all([
  loadStrategyContexts(path.join(repoRoot, 'strategy_lab', 'match_info')),
  loadAllRows('matches', 'id,match_code,kickoff_at_utc,match_date_cn,time_cn,home,away,home_cn,away_cn,home_score,away_score,status,status_detail,venue,stage,home_team:teams!matches_home_team_id_fkey(name_en,name_cn),away_team:teams!matches_away_team_id_fkey(name_en,name_cn),active'),
]);

const matchesById = new Map(
  matchRows
    .filter((row) => row.active && row.match_code)
    .map((row) => {
      const match = toAppMatch(row);
      return [match.id, match];
    }),
);

const matchedContexts = contexts
  .map((context) => ({ context, match: matchesById.get(context.match?.id) }))
  .filter((item) => item.match);

const matches = matchedContexts.map((item) => item.match);
const scoreOddsByMatch = Object.fromEntries(
  matchedContexts.map(({ context, match }) => [
    match.id,
    context.market?.scoreOptions || [],
  ]),
);

const tempStrategies = generateTempStrategyCandidates();
const tempMetadata = new Map(tempStrategies.map((strategy) => [strategy.id, strategy]));
const tempBacktests = runCandidateStrategyBacktests({
  matches,
  scoreOddsByMatch,
  strategies: tempStrategies,
});
const enrichedTempResults = tempBacktests.map((result) => enrichBacktestResult(
  result,
  defaultQualificationGate,
  tempMetadata.get(result.strategyId),
));
const selectedTop10 = selectQualifiedTopStrategies(enrichedTempResults, {
  limit: 10,
  gate: defaultQualificationGate,
  maxPerFamily: 2,
});

const productionStrategies = candidateStrategies.filter((strategy) => routerCandidateStrategyIds.includes(strategy.id));
const productionMetadata = new Map(productionStrategies.map((strategy) => [strategy.id, {
  ...strategy,
  family: productionFamily(strategy.id),
  style: productionStyle(strategy.id),
  parameters: { productionRouterCandidate: true },
  explanation: strategy.description,
}]));
const productionResults = runCandidateStrategyBacktests({
  matches,
  scoreOddsByMatch,
  strategies: productionStrategies,
}).map((result) => enrichBacktestResult(
  result,
  { ...defaultQualificationGate, minRoiPercent: Number.NEGATIVE_INFINITY },
  productionMetadata.get(result.strategyId),
));
const finalThree = selectFinalThreeStrategies([
  ...selectedTop10.map((result) => ({ ...result, source: 'tem_strategy_top10' })),
  ...productionResults.map((result) => ({ ...result, source: 'production_router_pool' })),
]);

const dataset = buildDatasetSummary({
  contexts,
  matchedContexts,
  tempStrategies,
  enrichedTempResults,
  selectedTop10,
  productionResults,
  finalThree,
});

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeJson(path.join(outputDir, 'raw_candidates.json'), {
    generatedAt: dataset.generatedAt,
    count: tempStrategies.length,
    candidates: tempStrategies.map(serializeStrategyDefinition),
  }),
  writeJson(path.join(outputDir, 'backtest_results.json'), {
    generatedAt: dataset.generatedAt,
    gate: defaultQualificationGate,
    dataset,
    results: enrichedTempResults,
  }),
  writeJson(path.join(outputDir, 'selected_top10.json'), {
    generatedAt: dataset.generatedAt,
    gate: defaultQualificationGate,
    selected: selectedTop10,
  }),
  writeFile(path.join(outputDir, 'selected_top10.md'), formatTop10Report({ dataset, selectedTop10 }), 'utf8'),
  writeJson(path.join(outputDir, 'phase2_final3.json'), {
    generatedAt: dataset.generatedAt,
    sourcePool: {
      tempTop10: selectedTop10.map((result) => result.strategyId),
      productionRouterCandidates: productionResults.map((result) => result.strategyId),
    },
    selected: finalThree,
  }),
  writeFile(path.join(outputDir, 'phase2_final3.md'), formatFinal3Report({ dataset, selectedTop10, productionResults, finalThree }), 'utf8'),
  writeFile(path.join(outputDir, 'experiment_notes.md'), formatExperimentNotes({ dataset, selectedTop10, productionResults, finalThree }), 'utf8'),
]);

console.log(`Wrote temp strategy research artifacts to ${outputDir}`);
console.log(`Temp candidates: ${tempStrategies.length}`);
console.log(`Qualified strategies: ${dataset.qualifiedTempStrategies}`);
console.log(`Selected top10: ${selectedTop10.length}`);
console.log(`Final3: ${finalThree.map((result) => `${result.finalProfile}:${result.strategyName}`).join(' | ')}`);

async function loadStrategyContexts(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const contexts = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const contextPath = path.join(rootDir, entry.name, 'context.json');
    try {
      const context = JSON.parse(await readFile(contextPath, 'utf8'));
      contexts.push({
        ...context,
        artifactDir: entry.name,
        artifactPath: path.relative(repoRoot, contextPath),
      });
    } catch {
      // In-progress folders are ignored until they have a context.json.
    }
  }

  return contexts.sort((a, b) => `${a.match?.date || ''} ${a.match?.time || ''}`.localeCompare(`${b.match?.date || ''} ${b.match?.time || ''}`));
}

async function loadAllRows(table, select) {
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

function buildDatasetSummary({
  contexts,
  matchedContexts,
  tempStrategies,
  enrichedTempResults,
  selectedTop10,
  productionResults,
  finalThree,
}) {
  const completedMatchIds = new Set();
  for (const result of enrichedTempResults) {
    for (const row of result.rows) completedMatchIds.add(row.matchId);
  }
  const familyCounts = countBy(tempStrategies, (strategy) => strategy.family);
  const qualifiedFamilyCounts = countBy(enrichedTempResults.filter((result) => result.qualified), (result) => result.family);

  return {
    generatedAt: new Date().toISOString(),
    contextFiles: contexts.length,
    contextsMatchedToDb: matchedContexts.length,
    completedMatchesSettled: completedMatchIds.size,
    tempCandidates: tempStrategies.length,
    tempFamilies: familyCounts,
    qualifiedTempStrategies: enrichedTempResults.filter((result) => result.qualified).length,
    qualifiedFamilies: qualifiedFamilyCounts,
    selectedTop10: selectedTop10.length,
    productionCompared: productionResults.length,
    finalThree: finalThree.length,
  };
}

function formatTop10Report({ dataset, selectedTop10 }) {
  return [
    '# Temp Strategy Top 10',
    '',
    '第一阶段产物：从大量中间策略中筛出 ROI 达标、样本足够且有解释价值的 10 个候选。',
    '',
    formatDatasetBlock(dataset),
    '',
    formatGateBlock(),
    '',
    '| # | 策略 | 家族 | 风格 | ROI | 成本 | 返还 | 命中 | Avg Picks | 说明 |',
    '| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...selectedTop10.map((result, index) => [
      `| ${index + 1}`,
      result.strategyName,
      result.family,
      result.style,
      `${formatSigned(result.roiPercent)}%`,
      formatMetric(result.cost),
      formatMetric(result.revenue),
      `${result.hitMatches}/${result.settledMatches}`,
      formatMetric(result.avgPicks),
      result.explanation,
      '|',
    ].join(' | ')),
    '',
  ].join('\n');
}

function formatFinal3Report({ dataset, selectedTop10, productionResults, finalThree }) {
  return [
    '# Phase 2 Final 3',
    '',
    '第二阶段产物：从第一阶段 Top10 和当前生产 router 四策略中，选出三个风格互补的候选。',
    '',
    formatDatasetBlock(dataset),
    '',
    '## Source Pool',
    '',
    `- Temp top10: ${selectedTop10.length}`,
    `- Production router candidates: ${productionResults.map((result) => result.strategyId).join(', ')}`,
    '',
    '| Profile | 策略 | 来源 | ROI | 成本 | 返还 | 命中 | Avg Picks | 为什么留下 |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...finalThree.map((result) => [
      `| ${result.finalProfile}`,
      result.strategyName,
      result.source || 'tem_strategy_top10',
      `${formatSigned(result.roiPercent)}%`,
      formatMetric(result.cost),
      formatMetric(result.revenue),
      `${result.hitMatches}/${result.settledMatches}`,
      formatMetric(result.avgPicks),
      `${result.finalReason} ${result.explanation}`,
      '|',
    ].join(' | ')),
    '',
  ].join('\n');
}

function formatExperimentNotes({ dataset, selectedTop10, productionResults, finalThree }) {
  const topFamilies = Object.entries(dataset.qualifiedFamilies)
    .sort((a, b) => b[1] - a[1])
    .map(([family, count]) => `- ${family}: ${count}`)
    .join('\n') || '- none';
  return [
    '# Temp Strategy Experiment Notes',
    '',
    '## What Ran',
    '',
    `Generated ${dataset.tempCandidates} temporary strategies across ${Object.keys(dataset.tempFamilies).length} families.`,
    `Backtested them on ${dataset.completedMatchesSettled} settled matches with pre-match context odds.`,
    `Qualified strategies after hard gate: ${dataset.qualifiedTempStrategies}.`,
    '',
    '## Gate',
    '',
    formatGateBlock(),
    '',
    '## Qualified Family Distribution',
    '',
    topFamilies,
    '',
    '## Top10 Observations',
    '',
    ...selectedTop10.map((result) => `- ${result.strategyName} (${result.strategyId}): ROI ${formatSigned(result.roiPercent)}%, hit ${result.hitMatches}/${result.settledMatches}, avg picks ${formatMetric(result.avgPicks)}. ${result.explanation}`),
    '',
    '## Production Pool Comparison',
    '',
    ...productionResults.map((result) => `- ${result.strategyName} (${result.strategyId}): ROI ${formatSigned(result.roiPercent)}%, hit ${result.hitMatches}/${result.settledMatches}, avg picks ${formatMetric(result.avgPicks)}.`),
    '',
    '## Final3',
    '',
    ...finalThree.map((result) => `- ${result.finalProfile}: ${result.strategyName} (${result.strategyId})，ROI ${formatSigned(result.roiPercent)}%，${result.finalReason}`),
    '',
    '## Next Iteration',
    '',
    '- Use the final3 as research candidates only until user approves router changes.',
    '- If adding them to production, first write router tests that keep the production pool explicit.',
    '- Watch for overfitting: high ROI from one narrow family should not automatically replace diverse candidates.',
    '',
  ].join('\n');
}

function formatDatasetBlock(dataset) {
  return [
    '## Dataset',
    '',
    `- Generated at: ${dataset.generatedAt}`,
    `- Context files: ${dataset.contextFiles}`,
    `- Matched to DB: ${dataset.contextsMatchedToDb}`,
    `- Settled completed matches: ${dataset.completedMatchesSettled}`,
    `- Temp candidates: ${dataset.tempCandidates}`,
    `- Qualified temp strategies: ${dataset.qualifiedTempStrategies}`,
  ].join('\n');
}

function formatGateBlock() {
  return [
    '## Qualification Gate',
    '',
    `- ROI >= ${defaultQualificationGate.minRoiPercent}%`,
    `- Settled matches >= ${defaultQualificationGate.minSettledMatches}`,
    `- Hit matches >= ${defaultQualificationGate.minHitMatches}`,
    `- Avg picks between ${defaultQualificationGate.minAvgPicks} and ${defaultQualificationGate.maxAvgPicks}`,
    `- Max picks <= ${defaultQualificationGate.maxPicks}`,
  ].join('\n');
}

function productionFamily(strategyId) {
  if (strategyId.startsWith('context_poisson')) return 'poisson_ev';
  if (strategyId === 'draw_anchor_3') return 'draw_anchor';
  if (strategyId === 'low_score_basket_4') return 'score_basket';
  return 'production';
}

function productionStyle(strategyId) {
  if (strategyId === 'context_poisson_ev_v2') return 'selected';
  if (strategyId === 'context_poisson_ev_v3') return 'balanced';
  if (strategyId === 'draw_anchor_3') return 'balanced';
  return 'balanced';
}

function countBy(rows, getKey) {
  const counts = {};
  for (const row of rows) {
    const key = getKey(row);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
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
    // CI should provide real environment variables.
  }
}

function writeJson(filePath, value) {
  return writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function formatMetric(value) {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}

function formatSigned(value) {
  const formatted = formatMetric(value);
  return Number(value) > 0 ? `+${formatted}` : formatted;
}
