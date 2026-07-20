import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the D1 AI sync still refreshes final strategy stats after the last match', async () => {
  const source = await readFile(new URL('../scripts/predictFutureWithStrategyRouterD1.mjs', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /if \(!entries\.length\) throw new Error/);
  assert.match(source, /No future matches; refreshing AI strategy stats only\./);
  assert.match(source, /ai-strategy-hit-details\.json/);
});
