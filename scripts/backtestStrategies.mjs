import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';

import {
  backtestLowestOddsStrategy,
  backtestFixedScoresStrategy,
  backtestTopPositiveTrendStrategy,
  formatBacktestReport,
} from '../src/backtestStrategies.mjs';
import { toAppMatch } from '../src/matchSchedule.mjs';
import { mapScoreOddsByMatch } from '../src/supabaseData.mjs';

await loadLocalEnv();

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
  .filter((row) => row.active && row.match_code && row.match_date_cn && row.time_cn && row.home && row.away)
  .map(toAppMatch)
  .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

const scoreOddsByMatch = mapScoreOddsByMatch(matches, oddsRows, trendRows);
const lowestOddsResult = backtestLowestOddsStrategy({
  strategyName: '每场买最低赔率2项',
  pickCount: 2,
  matches,
  scoreOddsByMatch,
});
const topTrendResult = backtestTopPositiveTrendStrategy({
  strategyName: '每场买赔率涨幅最大2项',
  pickCount: 2,
  matches,
  scoreOddsByMatch,
});
const lowScoreResult = backtestFixedScoresStrategy({
  strategyName: '每场买0-0、0-1、1-0、1-1',
  scores: ['0-0', '0-1', '1-0', '1-1'],
  matches,
  scoreOddsByMatch,
});

console.log(formatBacktestReport(lowestOddsResult));
console.log('\n---\n');
console.log(formatBacktestReport(topTrendResult));
console.log('\n---\n');
console.log(formatBacktestReport(lowScoreResult));

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
    // .env.local is optional; CI should use real environment variables.
  }
}
