import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('live hydration starts only after the static archive fast path is ruled out', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const staticSnapshotIndex = source.indexOf('const snapshot = await loadStaticSnapshot();');
  const staticGroupIndex = source.indexOf('const cachedGroupSnapshot = await loadStaticGroupSnapshot(groupCode);');
  const archiveGuardIndex = source.indexOf('if (snapshot?.archiveMode)', staticGroupIndex);
  const hydrateIndex = source.indexOf('hydrateLiveBoardFromD1();', archiveGuardIndex);
  const d1GroupIndex = source.indexOf('loadD1GroupState({ client: d1Client, groupCode })', archiveGuardIndex);
  const loadedMatchesIndex = source.indexOf('const loadedMatches = snapshot?.matches.length');
  const conditionalSetMatchesIndex = source.indexOf('if (!snapshot?.matches.length) {', loadedMatchesIndex);

  assert.ok(staticSnapshotIndex >= 0, 'static snapshot load must exist');
  assert.ok(staticGroupIndex > staticSnapshotIndex, 'group snapshot should load after the global snapshot');
  assert.ok(archiveGuardIndex > staticGroupIndex, 'archive mode should be decided after both snapshots load');
  assert.ok(hydrateIndex > archiveGuardIndex, 'archive mode must return before live hydration');
  assert.ok(d1GroupIndex > archiveGuardIndex, 'archive mode must return before D1 group reads');
  assert.ok(conditionalSetMatchesIndex > loadedMatchesIndex, 'group state success must not overwrite live matches with stale static snapshot');
});

test('archive mode keeps all saved result experiences on the group snapshot', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

  assert.match(source, /setStaticGroupSnapshot\(cachedGroupSnapshot\)/);
  assert.match(source, /staticGroupSnapshot\?\.advancement/);
  assert.match(source, /staticGroupSnapshot\?\.handicapChallenge/);
  assert.match(source, /staticGroupSnapshot\?\.championRoad/);
  assert.match(source, /世界杯已结束，当前为只读存档/);
});

test('public live board hydration covers recent finished matches missing from static snapshots', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

  assert.match(source, /buildRecentLiveDateWindow\(new Date\(\), \{ pastDays: 7, futureDays: 7 \}\)/);
});
