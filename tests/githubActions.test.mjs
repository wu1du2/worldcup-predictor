import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('match import workflow supports off-peak hourly schedule and manual runs with Supabase secrets', async () => {
  const workflow = await readFile(new URL('../.github/workflows/import-matches.yml', import.meta.url), 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron: '17 \* \* \* \*'/);
  assert.match(workflow, /concurrency:\n  group: import-matches\n  cancel-in-progress: false/);
  assert.match(workflow, /SUPABASE_URL: \$\{\{ secrets\.SUPABASE_URL \}\}/);
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
  assert.match(workflow, /npm run import:matches/);
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /node scripts\/reportActionFailure\.mjs --job=matches/);
});

test('odds import workflow is paused as a Supabase no-op', async () => {
  const workflow = await readFile(new URL('../.github/workflows/import-odds.yml', import.meta.url), 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron: '43 \* \* \* \*'/);
  assert.match(workflow, /concurrency:\n  group: import-odds\n  cancel-in-progress: false/);
  assert.match(workflow, /Odds import paused/);
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(workflow, /npm run import:odds/);
  assert.doesNotMatch(workflow, /npm run backfill:odds-trends/);
  assert.match(workflow, /intentionally does not write Supabase/);
});

test('live D1 import workflow runs every five minutes and writes only generated SQL', async () => {
  const workflow = await readFile(new URL('../.github/workflows/import-live-d1.yml', import.meta.url), 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
  assert.match(workflow, /concurrency:\n  group: import-live-d1\n  cancel-in-progress: true/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.match(workflow, /npm run import:live:d1/);
  assert.match(workflow, /if: hashFiles\('output\/d1-live-import\.sql'\) != ''/);
  assert.match(workflow, /wrangler@latest -- d1 execute worldcup-predictor --remote --file output\/d1-live-import\.sql/);
});
