import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createD1ApiClient,
  loadD1GroupState,
} from '../src/d1Data.mjs';

test('loadD1GroupState normalizes Worker group state into app players and predictions', async () => {
  const client = createD1ApiClient({
    baseUrl: 'https://worldcup-api.example.workers.dev',
    fetchImpl: async (url) => {
      assert.equal(url, 'https://worldcup-api.example.workers.dev/api/groups/lzscqjd/state');
      return new Response(JSON.stringify({
        group: { id: 'g1', code: 'lzscqjd', name: 'lzscqjd' },
        players: [{ id: 'p1', name: '张三' }],
        predictions: [{ player_id: 'p1', match_id: 'm1', scores: ['1-0', 99, '2-1'] }],
      }), { status: 200 });
    },
  });

  const state = await loadD1GroupState({ client, groupCode: 'lzscqjd' });

  assert.deepEqual(state, {
    group: { id: 'g1', code: 'lzscqjd', name: 'lzscqjd' },
    players: [
      { id: 'ai-player', name: 'AI推荐', isAi: true },
      { id: 'p1', name: '张三' },
    ],
    predictions: { p1: { m1: ['1-0', '2-1'] } },
  });
});

test('loadD1GroupState throws a readable error when Worker returns non-2xx', async () => {
  const client = createD1ApiClient({
    baseUrl: 'https://worldcup-api.example.workers.dev/',
    fetchImpl: async () => new Response(JSON.stringify({ error: 'group_not_found' }), { status: 404 }),
  });

  await assert.rejects(
    () => loadD1GroupState({ client, groupCode: 'missing' }),
    /D1 group state failed: 404 group_not_found/,
  );
});
