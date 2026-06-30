import { readFile, writeFile, mkdir } from 'node:fs/promises';

import { fetchJsonWithRetry } from '../src/matchImport.mjs';
import { normalizeEspnScoreboard, toAppMatch } from '../src/matchSchedule.mjs';
import { mapScoreOddsByMatch } from '../src/supabaseData.mjs';

const scoreboardUrl = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260720&limit=300';

const matches = await loadEmergencyMatches();
const oddsRows = await loadLatestLocalOddsRows();
const scoreOddsByMatch = mapScoreOddsByMatch(matches, oddsRows, []);
const snapshot = {
  generatedAt: new Date().toISOString(),
  source: 'emergency-static-snapshot',
  oddsWindow: null,
  matches,
  scoreOddsByMatch,
  aiRecommendationsByMatch: {},
};

await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/data-snapshot.json', import.meta.url), `${JSON.stringify(snapshot)}\n`);

console.log(`Wrote emergency snapshot: ${matches.length} matches, ${Object.keys(scoreOddsByMatch).length} odds matches.`);

async function loadEmergencyMatches() {
  try {
    const scoreboard = await fetchJsonWithRetry(scoreboardUrl, { retries: 3, timeoutMs: 20000, waitMs: 1000 });
    return normalizeEspnScoreboard(scoreboard).map((row) => toAppMatch(row));
  } catch (error) {
    const existing = await loadExistingSnapshotMatches();
    if (existing.length) {
      console.warn(`ESPN fetch failed; reusing existing snapshot matches. ${error.message || error}`);
      return existing;
    }
    throw error;
  }
}

async function loadExistingSnapshotMatches() {
  try {
    const text = await readFile(new URL('../public/data-snapshot.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.matches) ? parsed.matches : [];
  } catch {
    return [];
  }
}

async function loadLatestLocalOddsRows() {
  try {
    const text = await readFile(new URL('../docs/artifacts/odds-import/sporttery-score-odds-import.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.rows) ? parsed.rows : [];
  } catch {
    return [];
  }
}
