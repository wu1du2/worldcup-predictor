import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';

test('all live import and Worker deployment workflows are removed after archival', async () => {
  const retiredWorkflows = [
    'import-matches.yml',
    'import-odds.yml',
    'import-live-d1.yml',
    'deploy-worker.yml',
  ];

  for (const workflow of retiredWorkflows) {
    await assert.rejects(
      access(new URL(`../.github/workflows/${workflow}`, import.meta.url)),
      { code: 'ENOENT' },
    );
  }
});
