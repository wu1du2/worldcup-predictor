import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';

import { fetchJsonWithRetry } from '../src/matchImport.mjs';
import { normalizeEspnScoreboard, toMatchUpsertRows } from '../src/matchSchedule.mjs';
import { attachTeamsToMatches, parseTeamNameCsv, toTeamUpsertRows } from '../src/teamNames.mjs';
import { getGithubRunUrl, writeImportReport } from '../src/importReports.mjs';

const scoreboardUrl = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260720&limit=300';
const dryRun = process.argv.includes('--dry-run');
const startedAt = new Date().toISOString();

await loadLocalEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let client = null;
let matches = [];

try {
  const scoreboard = await fetchScoreboard();
  matches = normalizeEspnScoreboard(scoreboard);
  const teamNames = parseTeamNameCsv(await readFile(new URL('../data/team-name-mapping.csv', import.meta.url), 'utf8'));
  validateMatches(matches);

  console.log(`Fetched ${matches.length} resolved World Cup matches from ESPN.`);
  console.log(`Date range CN: ${matches[0].match_date_cn} to ${matches[matches.length - 1].match_date_cn}`);

  if (dryRun) {
    console.log('Dry run: not writing Supabase.');
    console.log(JSON.stringify(matches.slice(0, 3), null, 2));
  } else {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
    }

    client = createClient(supabaseUrl, supabaseKey);

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
    await reportImport({
      client,
      status: 'success',
      rowsWritten: matches.length,
      itemsSeen: matches.length,
      message: `Upserted ${matches.length} matches.`,
    });
  }
} catch (error) {
  if (!dryRun && supabaseUrl && supabaseKey) {
    client ||= createClient(supabaseUrl, supabaseKey);
    await reportImport({
      client,
      status: 'failed',
      rowsWritten: 0,
      itemsSeen: matches.length,
      message: error.message || 'Match import failed.',
      errorDetail: error.stack || String(error),
    });
  }
  throw error;
}

async function fetchScoreboard() {
  return fetchJsonWithRetry(scoreboardUrl, { retries: 3, timeoutMs: 20000, waitMs: 1000 });
}

function validateMatches(matches) {
  if (matches.length < 72) {
    throw new Error(`Expected at least 72 resolved World Cup matches, got ${matches.length}.`);
  }

  const codes = new Set();
  let groupStageCount = 0;
  for (const match of matches) {
    for (const field of ['match_code', 'kickoff_at_utc', 'match_date_cn', 'time_cn', 'home', 'away']) {
      if (!match[field]) throw new Error(`Match ${match.match_code || 'unknown'} missing ${field}.`);
    }

    if (/\b(Winner|Loser)\b/.test(`${match.home} ${match.away}`)) {
      throw new Error(`Unresolved bracket placeholder was not filtered for ${match.match_code}.`);
    }

    if (match.stage === 'Group Stage') groupStageCount += 1;

    if (codes.has(match.match_code)) {
      throw new Error(`Duplicate match_code ${match.match_code}.`);
    }
    codes.add(match.match_code);
  }

  if (groupStageCount !== 72) {
    throw new Error(`Expected 72 group-stage matches inside the import, got ${groupStageCount}.`);
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

async function reportImport({ client: reportClient, status, rowsWritten, itemsSeen, message, errorDetail = '' }) {
  await writeImportReport({
    client: reportClient,
    report: {
      jobName: 'matches',
      status,
      startedAt,
      rowsWritten,
      itemsSeen,
      message,
      errorDetail,
      runUrl: getGithubRunUrl(),
    },
  });
}
