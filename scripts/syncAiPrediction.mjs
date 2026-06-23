import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { buildAiPredictionEntries } from '../src/aiPredictionSync.mjs';
import {
  aiPlayerName,
  ensureAiPlayer,
  getGroupByCode,
  saveGroupPredictions,
} from '../src/supabaseData.mjs';

await loadLocalEnv();

const args = parseArgs(process.argv.slice(2));
const groupCode = args.group || 'lzscqjd';
const predictionFile = args.prediction || 'strategy_lab/predictions/strategy_20260623T204500_main_strategy_prediction.json';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
}

const client = createClient(supabaseUrl, supabaseKey);
const absolutePredictionFile = resolve(predictionFile);
const predictionLog = JSON.parse(await readFile(absolutePredictionFile, 'utf8'));
const contextsByFile = await loadContextsForPredictionLog(predictionLog, dirname(absolutePredictionFile));
const entries = buildAiPredictionEntries({ predictionLog, contextsByFile });
const group = await getGroupByCode({ client, groupCode });
const aiPlayer = await ensureAiPlayer({ client, groupId: group.id });

await saveGroupPredictions({
  client,
  groupId: group.id,
  playerId: aiPlayer.id,
  entries,
});

console.log(`Synced ${entries.length} AI prediction(s).`);
console.log(`Group: ${groupCode} (${group.id})`);
console.log(`Player: ${aiPlayerName} (${aiPlayer.id})`);
for (const entry of entries) {
  console.log(`${entry.matchId}: ${entry.scores.join(', ')}`);
}

async function loadContextsForPredictionLog(predictionLog, predictionDir) {
  const items = Array.isArray(predictionLog.predictions)
    ? predictionLog.predictions
    : [predictionLog];
  const contexts = {};

  for (const item of items) {
    const file = item.match_context_file;
    if (!file) throw new Error('Prediction item missing match_context_file.');
    contexts[file] = JSON.parse(await readFile(resolve(predictionDir, file), 'utf8'));
  }

  return contexts;
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
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
