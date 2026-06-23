import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';

import {
  buildPredictionContext,
  formatStrategyReport,
  runStrategyExperiment,
  verifyStrategyRun,
} from '../src/strategyLab.mjs';
import { toAppMatch } from '../src/matchSchedule.mjs';
import { mapScoreOddsByMatch } from '../src/supabaseData.mjs';

const defaultStrategy = `
主策略：低比分篮子 v0。
每场买 0-0、0-1、1-0、1-1，每个比分 1 注。
只使用 context 中的赛前赔率和赔率变化，不看赛果。
`;

await loadLocalEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
}

const runId = buildRunId(new Date());
const artifactDir = new URL(`../docs/artifacts/strategy-lab/${runId}/`, import.meta.url);
const client = createClient(supabaseUrl, supabaseKey);

const [matchRows, oddsRows, trendRows] = await Promise.all([
  loadAllRows('matches', 'id,match_code,kickoff_at_utc,match_date_cn,time_cn,home,away,home_cn,away_cn,home_score,away_score,status,status_detail,venue,stage,home_team:teams!matches_home_team_id_fkey(name_en,name_cn),away_team:teams!matches_away_team_id_fkey(name_en,name_cn),active'),
  loadAllRows('score_odds', 'home,away,kickoff_label,score,odds'),
  loadAllRows('score_odds_trends', 'home,away,kickoff_label,score,first_odds,latest_odds,change_pct,snapshots_count'),
]);

const matches = matchRows
  .filter((row) => row.active && row.match_code && row.match_date_cn && row.time_cn && row.home && row.away)
  .map((row) => ({ ...toAppMatch(row), kickoffAt: row.kickoff_at_utc }))
  .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
const scoreOddsByMatch = mapScoreOddsByMatch(matches, oddsRows, trendRows);
const contexts = matches
  .filter((match) => (scoreOddsByMatch[match.id] || []).length > 0)
  .map((match) => buildPredictionContext({
    match,
    scoreOptions: scoreOddsByMatch[match.id],
    generatedAt: new Date().toISOString(),
  }));
const resultsByMatchId = Object.fromEntries(
  matches
    .filter((match) => (
      match.status === 'post'
      && Number.isInteger(match.homeScore)
      && Number.isInteger(match.awayScore)
    ))
    .map((match) => [match.id, { homeScore: match.homeScore, awayScore: match.awayScore }]),
);

const run = runStrategyExperiment({
  strategy: defaultStrategy,
  contexts,
  resultsByMatchId,
});
const verification = verifyStrategyRun(run);

await mkdir(artifactDir, { recursive: true });
await Promise.all([
  writeJson('contexts.json', contexts),
  writeJson('predictions.json', run.predictionLogs),
  writeJson('settlements.json', run.settlements),
  writeJson('verify.json', verification),
  writeFile(new URL('strategy.txt', artifactDir), defaultStrategy.trimStart()),
  writeFile(new URL('report.txt', artifactDir), `${formatStrategyReport(run)}\n`),
]);

console.log(`Strategy Lab run: ${runId}`);
console.log(`Contexts: ${contexts.length}`);
console.log(`Predictions: ${run.predictionLogs.length}`);
console.log(`Settlements: ${run.settlements.length}`);
console.log(`ROI: ${run.summary.roiPercent}%`);
console.log(`Artifacts: ${artifactDir.pathname}`);

async function writeJson(filename, value) {
  await writeFile(new URL(filename, artifactDir), `${JSON.stringify(value, null, 2)}\n`);
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
    const envText = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
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

function buildRunId(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
