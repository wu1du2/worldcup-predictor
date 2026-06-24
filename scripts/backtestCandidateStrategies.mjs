import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  candidateStrategies,
  formatCandidateStrategySummary,
  runCandidateStrategyBacktests,
} from '../src/strategyCandidates.mjs';
import { toAppMatch } from '../src/matchSchedule.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const results = runCandidateStrategyBacktests({
  matches,
  scoreOddsByMatch,
});

const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const artifactDir = path.join(repoRoot, 'docs', 'artifacts', 'strategy-candidates', runId);
await mkdir(artifactDir, { recursive: true });

const dataset = buildDatasetSummary({ contexts, matchedContexts, results });
const strategyDefs = candidateStrategies.map(({ id, name, description }) => ({ id, name, description }));

await Promise.all([
  writeJson(path.join(artifactDir, 'dataset.json'), dataset),
  writeJson(path.join(artifactDir, 'strategies.json'), strategyDefs),
  writeJson(path.join(artifactDir, 'results.json'), results),
  writeFile(path.join(artifactDir, 'report.md'), buildReport({ dataset, results, strategyDefs }), 'utf8'),
]);

console.log(`Wrote candidate strategy backtest artifacts to ${artifactDir}`);
console.log(formatCandidateStrategySummary(results));

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
      // Some in-progress folders may not have a context yet; they are ignored for offline backtests.
    }
  }

  return contexts.sort((a, b) => `${a.match?.date || ''} ${a.match?.time || ''}`.localeCompare(`${b.match?.date || ''} ${b.match?.time || ''}`));
}

function buildDatasetSummary({ contexts, matchedContexts, results }) {
  const completedMatchIds = new Set();
  for (const result of results) {
    for (const row of result.rows) {
      completedMatchIds.add(row.matchId);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    contextFiles: contexts.length,
    contextsMatchedToDb: matchedContexts.length,
    completedMatchesSettled: completedMatchIds.size,
    skippedContextFiles: contexts.length - matchedContexts.length,
    matches: matchedContexts.map(({ context, match }) => ({
      id: match.id,
      date: match.date,
      time: match.time,
      match: `${match.home} vs ${match.away}`,
      status: match.status,
      hasResult: Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore),
      scoreOptions: context.market?.scoreOptions?.length || 0,
      contextPath: context.artifactPath,
    })),
  };
}

function buildReport({ dataset, results, strategyDefs }) {
  const lines = [
    '# Candidate Strategy Backtest',
    '',
    '说明：本报告只使用 `strategy_lab/match_info/**/context.json` 中的赛前 context/odds 生成 picks；赛果只在结算阶段从数据库读取。',
    '',
    '## Dataset',
    '',
    `- Context files: ${dataset.contextFiles}`,
    `- Matched to DB: ${dataset.contextsMatchedToDb}`,
    `- Settled completed matches: ${dataset.completedMatchesSettled}`,
    `- Skipped context files: ${dataset.skippedContextFiles}`,
    '',
    '## Strategies',
    '',
    ...strategyDefs.map((strategy) => `- \`${strategy.id}\`: ${strategy.name}。${strategy.description}`),
    '',
    '## Ranking',
    '',
    formatCandidateStrategySummary(results),
    '',
    '## Per-Strategy Details',
    '',
  ];

  for (const result of [...results].sort((a, b) => b.roiPercent - a.roiPercent || b.netProfit - a.netProfit)) {
    lines.push(`### ${result.strategyId} - ${result.strategyName}`);
    lines.push('');
    lines.push(`成本 ${formatMetric(result.cost)}，返还 ${formatMetric(result.revenue)}，净收益 ${formatSigned(result.netProfit)}，ROI ${formatSigned(result.roiPercent)}%，命中 ${result.hitMatches}/${result.settledMatches}。`);
    lines.push('');
    for (const row of result.rows) {
      const picks = row.picks.map((pick) => {
        const trend = Number.isFinite(Number(pick.changePct)) ? `, ${formatSigned(pick.changePct)}%` : '';
        return `${pick.score}(${formatMetric(pick.odds)}${trend})`;
      }).join(', ');
      lines.push(`- ${row.date} ${row.time} ${row.match} [${row.actualScore}] -> ${picks}；${row.hitScore ? `命中 ${row.hitScore}` : '未中'}，净收益 ${formatSigned(row.netProfit)}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
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
