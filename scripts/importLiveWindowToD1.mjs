import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { fetchJsonWithRetry } from '../src/matchImport.mjs';
import { normalizeEspnScoreboard } from '../src/matchSchedule.mjs';
import {
  buildSportteryScoreUrl,
  dedupeParsedMatches,
  dedupeScoreOptionRows,
  filterMatchesByKickoffDates,
  parseSportteryScoreOddsHtml,
  toScoreOptionRows,
  validateParsedOddsMatches,
  validateScoreOddsRows,
} from '../src/sportteryOdds.mjs';
import {
  buildD1LiveImportSql,
  buildLiveDateWindow,
  hasLiveWindowChanged,
  normalizeLiveComparable,
} from '../src/d1LiveImport.mjs';

const scoreboardUrl = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260720&limit=300';
const dryRun = process.argv.includes('--dry-run');
const startedAt = new Date().toISOString();
const windowArg = process.argv.find((arg) => arg.startsWith('--from='))?.slice('--from='.length);
const outputPath = process.env.D1_LIVE_IMPORT_SQL || new URL('../output/d1-live-import.sql', import.meta.url).pathname;
const d1ApiUrl = process.env.D1_API_URL || process.env.VITE_D1_API_URL || 'https://worldcup-predictor-api.wu1du2.workers.dev';
const liveWindow = windowArg
  ? buildWindowFromDate(windowArg)
  : buildLiveDateWindow(new Date(), Number(process.env.LIVE_WINDOW_DAYS || 2));

await loadLocalEnv();
await mkdir(new URL('../output/', import.meta.url), { recursive: true });
await rm(outputPath, { force: true });

const scoreboard = await fetchJsonWithRetry(scoreboardUrl, { retries: 3, timeoutMs: 20000, waitMs: 1000 });
const matches = normalizeEspnScoreboard(scoreboard)
  .filter((match) => match.match_date_cn >= liveWindow.from && match.match_date_cn <= liveWindow.to)
  .map((match) => ({ ...match, updated_at: startedAt }));
const scoreOddsRows = await fetchLiveScoreOddsRows(liveWindow.dates, startedAt);
const current = await fetchCurrentLiveBoard(liveWindow);
const nextComparable = normalizeLiveComparable({ matches, scoreOddsRows });
const currentComparable = normalizeLiveComparable(current);
const changed = hasLiveWindowChanged(currentComparable, nextComparable);

console.log(`Live D1 window: ${liveWindow.from} -> ${liveWindow.to}`);
console.log(`Fetched ${matches.length} matches and ${scoreOddsRows.length} score odds rows.`);
console.log(`Changed: ${changed ? 'yes' : 'no'}`);

if (!changed) {
  console.log('No D1 SQL generated because live window is unchanged.');
  process.exit(0);
}

const report = {
  id: randomUUID(),
  jobName: 'live-d1',
  status: 'success',
  startedAt,
  finishedAt: new Date().toISOString(),
  rowsWritten: matches.length + scoreOddsRows.length + 1,
  itemsSeen: matches.length + scoreOddsRows.length,
  message: `Updated D1 live window ${liveWindow.from} to ${liveWindow.to}.`,
  runUrl: getGithubRunUrl(),
};
const sql = buildD1LiveImportSql({ matches, scoreOddsRows, report });
await writeFile(outputPath, sql);
console.log(`Wrote live D1 import SQL to ${outputPath}`);

if (dryRun) {
  console.log(sql.split('\n').slice(0, 20).join('\n'));
}

async function fetchLiveScoreOddsRows(dates, updatedAt) {
  const rows = [];
  for (const date of dates) {
    const url = buildSportteryScoreUrl(date);
    try {
      const html = await fetchGb18030WithRetry(url);
      const matchesForDate = validateParsedOddsMatches(
        filterMatchesByKickoffDates(dedupeParsedMatches(parseSportteryScoreOddsHtml(html)), dates),
      );
      rows.push(...toScoreOptionRows(matchesForDate, updatedAt));
    } catch (error) {
      console.warn(`Failed to fetch odds for ${date}: ${error.message}`);
    }
  }

  if (!rows.length) return [];
  return validateScoreOddsRows(dedupeScoreOptionRows(rows));
}

async function fetchCurrentLiveBoard(window) {
  try {
    const response = await fetch(`${d1ApiUrl.replace(/\/$/, '')}/api/live-board?from=${window.from}&to=${window.to}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`D1 live-board failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(`Could not read current D1 live-board; generating SQL as changed. ${error.message}`);
    return {};
  }
}

async function fetchGb18030WithRetry(urlToFetch, options = {}) {
  const {
    fetchImpl = fetch,
    retries = 3,
    timeoutMs = 20000,
    waitMs = 1000,
  } = options;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(urlToFetch, {
        headers: { 'user-agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`500.com request failed: ${response.status}`);
      const buffer = await response.arrayBuffer();
      return new TextDecoder('gb18030').decode(buffer);
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await wait(waitMs * (attempt + 1));
    }
  }
  throw lastError;
}

function buildWindowFromDate(from) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error(`Invalid --from date: ${from}`);
  return buildLiveDateWindow(new Date(`${from}T00:00:00+08:00`), Number(process.env.LIVE_WINDOW_DAYS || 2));
}

function getGithubRunUrl() {
  const serverUrl = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  return serverUrl && repository && runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : '';
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
