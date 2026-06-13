import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('match import workflow supports five-minute schedule and manual runs with Supabase secrets', async () => {
  const workflow = await readFile(new URL('../.github/workflows/import-matches.yml', import.meta.url), 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
  assert.match(workflow, /SUPABASE_URL: \$\{\{ secrets\.SUPABASE_URL \}\}/);
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
  assert.match(workflow, /npm run import:matches/);
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /node scripts\/reportActionFailure\.mjs --job=matches/);
});

test('odds import workflow supports five-minute schedule, manual runs, and failure reports', async () => {
  const workflow = await readFile(new URL('../.github/workflows/import-odds.yml', import.meta.url), 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
  assert.match(workflow, /SUPABASE_URL: \$\{\{ secrets\.SUPABASE_URL \}\}/);
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
  assert.match(workflow, /npm run import:odds/);
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /node scripts\/reportActionFailure\.mjs --job=odds/);
});
