import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getGroupCodeFromSearch,
  mapPredictionsByPlayer,
  mergePlayers,
} from '../src/supabaseData.mjs';

test('getGroupCodeFromSearch reads group query param and falls back to default', () => {
  assert.equal(getGroupCodeFromSearch('?group=wx-football'), 'wx-football');
  assert.equal(getGroupCodeFromSearch('?group=%E7%90%83%E5%8F%8B'), '球友');
  assert.equal(getGroupCodeFromSearch(''), 'default');
});

test('mergePlayers returns only group-specific database players', () => {
  const merged = mergePlayers([
    { id: 'db-p01', name: '阿哲' },
    { id: 'db-custom', name: '小吴' },
  ]);

  assert.deepEqual(merged, [
    { id: 'db-p01', name: '阿哲' },
    { id: 'db-custom', name: '小吴' },
  ]);
});

test('mapPredictionsByPlayer converts database rows to app prediction state', () => {
  const rows = [
    { player_id: 'player-a', match_id: 'm01', scores: ['1-0', '2-1'] },
    { player_id: 'player-a', match_id: 'm02', scores: ['0-0'] },
    { player_id: 'player-b', match_id: 'm01', scores: ['1-1'] },
  ];

  assert.deepEqual(mapPredictionsByPlayer(rows), {
    'player-a': {
      m01: ['1-0', '2-1'],
      m02: ['0-0'],
    },
    'player-b': {
      m01: ['1-1'],
    },
  });
});
