import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';

import { fetchJsonWithRetry } from '../src/matchImport.mjs';
import { normalizeEspnScoreboard, toMatchUpsertRows } from '../src/matchSchedule.mjs';
import { attachTeamsToMatches, parseTeamNameCsv, toTeamUpsertRows } from '../src/teamNames.mjs';

const scoreboardUrl = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260627&limit=200';
const dryRun = process.argv.includes('--dry-run');

await loadLocalEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const scoreboard = await fetchScoreboard();
const matches = normalizeEspnScoreboard(scoreboard);
const teamNames = parseTeamNameCsv(await readFile(new URL('../data/team-name-mapping.csv', import.meta.url), 'utf8'));
validateMatches(matches);

console.log(`Fetched ${matches.length} World Cup group-stage matches from ESPN.`);
console.log(`Date range CN: ${matches[0].match_date_cn} to ${matches[matches.length - 1].match_date_cn}`);

if (dryRun) {
  console.log('Dry run: not writing Supabase.');
  console.log(JSON.stringify(matches.slice(0, 3), null, 2));
  process.exit(0);
}

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
}

const client = createClient(supabaseUrl, supabaseKey);

const { error: teamsError } = await client
  .from('teams')
  .upsert(toTeamUpsertRows(teamNames), { onConflict: 'source,name_en' });

if (teamsError) throw teamsError;

const { data: teams, error: loadTeamsError } = await client
  .from('teams')
  .select('id,source,name_en,name_cn')
  .eq('source', 'espn');

if (loadTeamsError) throw loadTeamsError;

const { error } = await client
  .from('matches')
  .upsert(toMatchUpsertRows(attachTeamsToMatches(matches, teams || [])), { onConflict: 'match_code' });

if (error) throw error;

console.log(`Upserted ${teamNames.length} teams into Supabase.`);
console.log(`Upserted ${matches.length} matches into Supabase.`);

async function fetchScoreboard() {
  return fetchJsonWithRetry(scoreboardUrl, { retries: 3, timeoutMs: 20000, waitMs: 1000 });
}

function validateMatches(matches) {
  if (matches.length !== 72) {
    throw new Error(`Expected 72 group-stage matches, got ${matches.length}.`);
  }

  const codes = new Set();
  for (const match of matches) {
    for (const field of ['match_code', 'kickoff_at_utc', 'match_date_cn', 'time_cn', 'home', 'away']) {
      if (!match[field]) throw new Error(`Match ${match.match_code || 'unknown'} missing ${field}.`);
    }

    if (codes.has(match.match_code)) {
      throw new Error(`Duplicate match_code ${match.match_code}.`);
    }
    codes.add(match.match_code);
  }
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
