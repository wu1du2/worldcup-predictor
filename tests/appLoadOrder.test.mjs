import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('public live board hydration is not gated or overwritten by group state loading', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const staticSnapshotIndex = source.indexOf('const snapshot = await loadStaticSnapshot();');
  const hydrateIndex = source.indexOf('hydrateLiveBoardFromD1();', staticSnapshotIndex);
  const staticGroupIndex = source.indexOf('const staticGroupSnapshot = await loadStaticGroupSnapshot(groupCode);');
  const loadedMatchesIndex = source.indexOf('const loadedMatches = snapshot?.matches.length');
  const conditionalSetMatchesIndex = source.indexOf('if (!snapshot?.matches.length) {', loadedMatchesIndex);

  assert.ok(staticSnapshotIndex >= 0, 'static snapshot load must exist');
  assert.ok(hydrateIndex > staticSnapshotIndex, 'live board should hydrate after static snapshot is visible');
  assert.ok(hydrateIndex < staticGroupIndex, 'live board should not wait for group state loading');
  assert.ok(conditionalSetMatchesIndex > loadedMatchesIndex, 'group state success must not overwrite live matches with stale static snapshot');
});
