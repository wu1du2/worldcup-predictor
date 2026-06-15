import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

import {
  buildSportteryScoreUrl,
  dedupeParsedMatches,
  parseSportteryScoreOddsHtml,
  toScoreOptionRows,
  validateParsedOddsMatches,
  validateScoreOddsRows,
} from '../src/sportteryOdds.mjs';
import { getGithubRunUrl, writeImportReport } from '../src/importReports.mjs';
import {
  buildOddsImportSnapshotRow,
  writeOddsImportSnapshot,
} from '../src/oddsImportSnapshots.mjs';

const artifactDir = new URL('../docs/artifacts/odds-import/', import.meta.url);
const dryRun = process.argv.includes('--dry-run');
const dateArg = process.argv.find((arg) => arg.startsWith('--date='))?.slice('--date='.length);
const date = dateArg || formatChinaDate(new Date());
const startedAt = new Date().toISOString();

await loadLocalEnv();
await mkdir(artifactDir, { recursive: true });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let client = null;
let matches = [];
let rows = [];

try {
  const url = buildSportteryScoreUrl(date);
  const html = await fetchGb18030WithRetry(url);
  await writeFile(new URL(`500-score-${date}.html`, artifactDir), html);

  matches = validateParsedOddsMatches(dedupeParsedMatches(parseSportteryScoreOddsHtml(html)));
  rows = validateScoreOddsRows(toScoreOptionRows(matches));
  await writeFile(new URL('sporttery-score-odds-import.json', artifactDir), `${JSON.stringify({ date, sourceUrl: url, matches, rows }, null, 2)}\n`);

  console.log(`Fetched Sporttery score odds from ${url}`);
  console.log(`Parsed ${matches.length} unique matches and ${rows.length} score odds rows.`);

  if (dryRun) {
    console.log('Dry run: not writing Supabase.');
    console.log(JSON.stringify(matches.slice(0, 5), null, 2));
  } else {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
    }

    client = createClient(supabaseUrl, supabaseKey);
    await writeOddsImportSnapshot({
      client,
      row: buildOddsImportSnapshotRow({
        source: '500',
        sourceDate: date,
        sourceUrl: url,
        rawHtml: html,
        matches,
        rows,
        createdAt: startedAt,
      }),
    });

    const { error } = await client
      .from('score_odds')
      .upsert(rows, { onConflict: 'source,source_match_key,score' });

    if (error) throw error;

    console.log(`Upserted ${rows.length} score odds rows into Supabase.`);
    await reportImport({
      client,
      status: 'success',
      rowsWritten: rows.length,
      itemsSeen: matches.length,
      message: `Upserted ${rows.length} score odds rows.`,
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
      message: error.message || 'Odds import failed.',
      errorDetail: error.stack || String(error),
    });
  }
  throw error;
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

function formatChinaDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
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

async function reportImport({ client: reportClient, status, rowsWritten, itemsSeen, message, errorDetail = '' }) {
  await writeImportReport({
    client: reportClient,
    report: {
      jobName: 'odds',
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
