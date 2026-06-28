import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildKnockoutProxyBacktestReport,
  enrichKnockoutProxyBacktestResult,
  filterKnockoutProxyMatches,
} from '../src/knockoutProxyBacktest.mjs';
import {
  buildKnockoutStrategyEvolutionData,
  formatKnockoutStrategyEvolutionDataModule,
} from '../src/knockoutStrategyEvolutionBuilder.mjs';
import { toAppMatch } from '../src/matchSchedule.mjs';
import { mapScoreOddsByMatch } from '../src/supabaseData.mjs';
import {
  candidateStrategies,
  runCandidateStrategyBacktests,
} from '../src/strategyCandidates.mjs';
import { generateTempStrategyCandidates } from '../src/tempStrategyLab.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await loadLocalEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
}

const client = createClient(supabaseUrl, supabaseKey);
const [contexts, matchRows, oddsRows, trendRows] = await Promise.all([
  loadStrategyContexts(path.join(repoRoot, 'strategy_lab', 'match_info')),
  loadAllRows('matches', 'id,match_code,kickoff_at_utc,match_date_cn,time_cn,home,away,home_cn,away_cn,home_score,away_score,status,status_detail,venue,stage,home_team:teams!matches_home_team_id_fkey(name_en,name_cn),away_team:teams!matches_away_team_id_fkey(name_en,name_cn),active'),
  loadAllRows('score_odds', 'home,away,kickoff_label,score,odds'),
  loadAllRows('score_odds_trends', 'home,away,kickoff_label,score,first_odds,latest_odds,change_pct,snapshots_count'),
]);

const contextsByMatchId = new Map(contexts.map((context) => [context.match?.id, context]));
const matches = matchRows
  .filter((row) => row.active && row.match_code && row.match_date_cn && row.time_cn)
  .map((row) => {
    const match = toAppMatch(row);
    return {
      ...match,
      strategyContext: contextsByMatchId.get(match.id) || {},
    };
  })
  .sort((a, b) => `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`));

const matchedContexts = matches.filter((match) => contextsByMatchId.has(match.id));
const scoreOddsByMatch = mapScoreOddsByMatch(matches, oddsRows, trendRows);
const proxyMatches = filterKnockoutProxyMatches({ matches, scoreOddsByMatch });
const proxyMatchList = proxyMatches.map((item) => item.match);
const productionStrategyIds = new Set(candidateStrategies.map((strategy) => strategy.id));
const tempStrategies = generateTempStrategyCandidates({ maxCandidates: 200 })
  .filter((strategy) => !productionStrategyIds.has(strategy.id));
const strategies = [...candidateStrategies, ...tempStrategies];
const backtestResults = runCandidateStrategyBacktests({
  matches: proxyMatchList,
  scoreOddsByMatch,
  strategies,
});
const results = backtestResults
  .map((result) => enrichKnockoutProxyBacktestResult(result, {
    explanationScore: getExplanationScore(result.strategyId),
    proxyMatches: proxyMatches.length,
  }))
  .sort((a, b) => b.knockoutProxyScore - a.knockoutProxyScore || b.roiPercent - a.roiPercent);

const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const artifactDir = path.join(repoRoot, 'docs', 'artifacts', 'knockout-strategy-loop', runId);
await mkdir(artifactDir, { recursive: true });
const generatedAt = new Date().toISOString();
const evolutionData = buildKnockoutStrategyEvolutionData({
  results,
  strategies,
  generatedAt,
  proxyMatches: proxyMatches.length,
});
const evolutionDataModule = formatKnockoutStrategyEvolutionDataModule(evolutionData);

const dataset = {
  generatedAt,
  contextFiles: contexts.length,
  contextsMatchedToDb: matchedContexts.length,
  matches: matches.length,
  proxyMatches: proxyMatches.length,
  strategies: strategies.length,
  productionStrategies: candidateStrategies.length,
  tempStrategies: tempStrategies.length,
  filter: {
    minScoreOptions: 5,
    rules: [
      '已完场且有足够比分赔率',
      '强弱差明显且低比分倾向',
      '或低比分倾向',
      '或小组末轮压力',
      '或真实淘汰赛',
    ],
  },
};

await Promise.all([
  writeJson(path.join(artifactDir, 'dataset.json'), dataset),
  writeJson(path.join(artifactDir, 'proxy_matches.json'), proxyMatches.map(serializeProxyMatch)),
  writeJson(path.join(artifactDir, 'results.json'), results),
  writeJson(path.join(artifactDir, 'evolution_data.json'), evolutionData),
  writeFile(path.join(artifactDir, 'knockoutStrategyEvolutionData.mjs'), evolutionDataModule, 'utf8'),
  writeFile(path.join(repoRoot, 'src', 'knockoutStrategyEvolutionData.mjs'), evolutionDataModule, 'utf8'),
  writeFile(path.join(artifactDir, 'report.md'), buildKnockoutProxyBacktestReport({
    dataset,
    proxyMatches,
    results,
  }), 'utf8'),
]);

console.log(`Wrote knockout proxy backtest artifacts to ${artifactDir}`);
console.log(`Proxy matches: ${proxyMatches.length}`);
console.log(`Strategies: ${strategies.length} (${candidateStrategies.length} production + ${tempStrategies.length} temp)`);
console.log('Updated src/knockoutStrategyEvolutionData.mjs');
for (const result of results.slice(0, 10)) {
  console.log(`${result.strategyId}: score ${formatMetric(result.knockoutProxyScore)}, ROI ${formatSigned(result.roiPercent)}%, hit ${result.hitMatches}/${result.settledMatches}, avg picks ${formatMetric(result.averagePicks)}`);
}

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

function serializeProxyMatch(item) {
  return {
    matchId: item.match.id,
    date: item.match.date,
    time: item.match.time,
    match: `${item.match.home} vs ${item.match.away}`,
    actualScore: `${item.match.homeScore}-${item.match.awayScore}`,
    stage: item.match.stage,
    reasons: item.reasons,
    profile: item.profile,
  };
}

function getExplanationScore(strategyId) {
  if (/source|consensus/.test(strategyId)) return 90;
  if (/poisson|hybrid/.test(strategyId)) return 84;
  if (/favorite|underdog|draw|outcome|trend/.test(strategyId)) return 78;
  return 70;
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
