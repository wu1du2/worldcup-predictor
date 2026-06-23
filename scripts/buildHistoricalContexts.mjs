import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildHistoricalMarketOnlyFiles,
  getHistoricalContextDirName,
} from '../src/historicalContextBuilder.mjs';
import { toAppMatch } from '../src/matchSchedule.mjs';
import { mapScoreOddsByMatch } from '../src/supabaseData.mjs';

await loadLocalEnv();

const args = parseArgs(process.argv.slice(2));
const overwrite = args.overwrite === 'true';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
}

const client = createClient(supabaseUrl, supabaseKey);
const [matchRows, oddsRows, trendRows] = await Promise.all([
  loadAllRows('matches', 'id,match_code,kickoff_at_utc,match_date_cn,time_cn,home,away,home_cn,away_cn,home_score,away_score,status,status_detail,venue,stage,home_team:teams!matches_home_team_id_fkey(name_en,name_cn),away_team:teams!matches_away_team_id_fkey(name_en,name_cn),active'),
  loadAllRows('score_odds', 'home,away,kickoff_label,score,odds'),
  loadAllRows('score_odds_trends', 'home,away,kickoff_label,score,first_odds,latest_odds,change_pct,snapshots_count'),
]);
const matches = matchRows
  .filter((row) => (
    row.active
    && row.match_code
    && row.match_date_cn
    && row.time_cn
    && row.home
    && row.away
    && row.status === 'post'
    && Number.isInteger(row.home_score)
    && Number.isInteger(row.away_score)
  ))
  .map((row) => ({ ...toAppMatch(row), kickoffAt: row.kickoff_at_utc }))
  .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
const scoreOddsByMatch = mapScoreOddsByMatch(matches, oddsRows, trendRows);
const targetMatches = matches.filter((match) => (scoreOddsByMatch[match.id] || []).length > 0);
let created = 0;
let skipped = 0;

for (const match of targetMatches) {
  const dir = new URL(`../strategy_lab/match_info/${getHistoricalContextDirName(match)}/`, import.meta.url);
  const contextFile = new URL('context.json', dir);
  if (!overwrite && await exists(contextFile)) {
    skipped += 1;
    continue;
  }

  const files = buildHistoricalMarketOnlyFiles({
    match,
    scoreOptions: scoreOddsByMatch[match.id],
    generatedAt: new Date().toISOString(),
  });
  for (const [relativePath, contents] of Object.entries(files)) {
    const file = new URL(relativePath, dir);
    const filePath = fileURLToPath(file);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(file, contents);
  }
  created += 1;
}

console.log(`Historical context target matches: ${targetMatches.length}`);
console.log(`Created/updated: ${created}`);
console.log(`Skipped existing: ${skipped}`);

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

async function exists(fileUrl) {
  try {
    await access(fileUrl);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    parsed[key] = value;
  }
  return parsed;
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
