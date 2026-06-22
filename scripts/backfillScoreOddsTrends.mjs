import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';

import { buildScoreOddsTrendRows } from '../src/scoreOddsTrends.mjs';

const dryRun = process.argv.includes('--dry-run');
const matchKey = {
  source: '500',
  issue: processArg('issue') || '周三022',
  kickoffLabel: processArg('kickoff') || '06-18 04:00',
  home: processArg('home') || '英格兰',
  away: processArg('away') || '克罗地亚',
};

await loadLocalEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
}

const client = createClient(supabaseUrl, supabaseKey);
const snapshots = await loadAllSnapshots(client);
const rows = buildScoreOddsTrendRows({ snapshots, matchKey });

if (!rows.length) {
  throw new Error(`No trend rows found for ${matchKey.kickoffLabel} ${matchKey.home} vs ${matchKey.away}.`);
}

console.log(`Built ${rows.length} score odds trend rows for ${matchKey.home} vs ${matchKey.away}.`);
console.log(JSON.stringify(rows.filter((row) => ['4-2', '2-1', '1-0', '3-3'].includes(row.score)), null, 2));

if (dryRun) {
  console.log('Dry run: not writing Supabase.');
} else {
  const { error } = await client
    .from('score_odds_trends')
    .upsert(rows, { onConflict: 'source,source_match_key,score' });

  if (error) throw error;
  console.log(`Upserted ${rows.length} score odds trend rows into Supabase.`);
}

async function loadAllSnapshots(client) {
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('odds_import_snapshots')
      .select('created_at,parsed_json')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

function processArg(name) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
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
