import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';

import { buildDefaultAiPredictionEntries, defaultAiPredictionScores } from '../src/aiPredictionBatch.mjs';
import {
  aiPlayerName,
  ensureAiPlayer,
  getGroupByCode,
  loadMatches,
  saveGroupPredictions,
} from '../src/supabaseData.mjs';

await loadLocalEnv();

const args = parseArgs(process.argv.slice(2));
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
}

const client = createClient(supabaseUrl, supabaseKey);
const groups = args.group
  ? [await getGroupByCode({ client, groupCode: args.group })]
  : await loadAllGroups(client);
const matches = await loadMatches({ client });
const entries = buildDefaultAiPredictionEntries({ matches });

if (!groups.length) throw new Error('No groups found.');
if (!entries.length) throw new Error('No active matches found.');

console.log(`AI scores: ${defaultAiPredictionScores.join(', ')}`);
console.log(`Groups: ${groups.length}`);
console.log(`Active matches: ${entries.length}`);

for (const group of groups) {
  const aiPlayer = await ensureAiPlayer({ client, groupId: group.id });

  if (!args.dryRun) {
    await saveGroupPredictions({
      client,
      groupId: group.id,
      playerId: aiPlayer.id,
      entries,
    });
  }

  const coverage = args.dryRun
    ? { written: 0, missing: entries.map((entry) => entry.matchId) }
    : await verifyAiPredictionCoverage({ client, groupId: group.id, playerId: aiPlayer.id, entries });

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
  console.log('AI predictions are complete for all selected groups.');
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
