import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';

import { buildAllScoreOddsTrendRows, buildScoreOddsTrendRows } from '../src/scoreOddsTrends.mjs';

const dryRun = process.argv.includes('--dry-run');
const matchKey = buildMatchKeyFromArgs();

await loadLocalEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
}

const client = createClient(supabaseUrl, supabaseKey);
const snapshots = await loadAllSnapshots(client);
const rows = matchKey
  ? buildScoreOddsTrendRows({ snapshots, matchKey })
  : buildAllScoreOddsTrendRows({ snapshots });

if (!rows.length) {
  throw new Error(matchKey
    ? `No trend rows found for ${matchKey.kickoffLabel} ${matchKey.home} vs ${matchKey.away}.`
    : 'No trend rows found in odds snapshots.');
}

const matchCount = new Set(rows.map((row) => row.source_match_key)).size;
console.log(`Built ${rows.length} score odds trend rows for ${matchCount} matches.`);
console.log(JSON.stringify(rows.slice(0, 12), null, 2));

if (dryRun) {
  console.log('Dry run: not writing Supabase.');
} else {
  for (const chunk of chunkRows(rows, 500)) {
    await upsertTrendRows(client, chunk);
  }
  console.log(`Upserted ${rows.length} score odds trend rows into Supabase.`);
}

async function loadAllSnapshots(client) {
  const pageSize = 1000;
  const rows = [];

  for (const sourceDate of buildSourceDateRange()) {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await client
        .from('odds_import_snapshots')
        .select('created_at,parsed_json')
        .eq('source', '500')
        .eq('source_date', sourceDate)
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
  }

  return rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

function processArg(name) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function buildMatchKeyFromArgs() {
  const issue = processArg('issue');
  const kickoffLabel = processArg('kickoff');
  const home = processArg('home');
  const away = processArg('away');

  if (!issue && !kickoffLabel && !home && !away) return null;
  return {
    source: '500',
    issue,
    kickoffLabel,
    home,
    away,
  };
}

function chunkRows(rows, size) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

async function upsertTrendRows(client, rowsToWrite) {
  const { error } = await client
    .from('score_odds_trends')
    .upsert(rowsToWrite, { onConflict: 'source,source_match_key,score' });

  if (!isMissingKickoffAtColumn(error)) {
    if (error) throw error;
    return;
  }

  const legacyRows = rowsToWrite.map(({ kickoff_at_cn, ...row }) => row);
  const { error: legacyError } = await client
    .from('score_odds_trends')
    .upsert(legacyRows, { onConflict: 'source,source_match_key,score' });
  if (legacyError) throw legacyError;
}

function isMissingKickoffAtColumn(error) {
  return error?.code === '42703' || /kickoff_at_cn/i.test(error?.message || '');
}

function buildSourceDateRange() {
  const start = new Date('2026-06-01T00:00:00Z');
  const end = new Date('2026-07-20T00:00:00Z');
  const dates = [];

  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }

  return dates;
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
