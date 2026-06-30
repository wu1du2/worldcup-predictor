import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createD1GroupPlayer,
  createD1ApiClient,
  loadD1LiveBoard,
  loadD1GroupState,
  saveD1GroupPredictions,
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

test('loadD1GroupState calls fetch without binding it to the client object', async () => {
  let thisValue;
  const fetchImpl = function fetchWithThisCheck() {
    thisValue = this;
    return Promise.resolve(new Response(JSON.stringify({
      group: { id: 'g1', code: 'lzscqjd', name: 'lzscqjd' },
      players: [],
      predictions: [],
    }), { status: 200 }));
  };
  const client = createD1ApiClient({
    baseUrl: 'https://worldcup-api.example.workers.dev',
    fetchImpl,
  });

  await loadD1GroupState({ client, groupCode: 'lzscqjd' });

  assert.equal(thisValue, undefined);
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

test('createD1GroupPlayer posts a trimmed player name to the Worker', async () => {
  const client = createD1ApiClient({
    baseUrl: 'https://worldcup-api.example.workers.dev/',
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://worldcup-api.example.workers.dev/api/groups/lzscqjd/players');
      assert.equal(init.method, 'POST');
      assert.equal(init.headers['content-type'], 'application/json');
      assert.deepEqual(JSON.parse(init.body), { name: '张三' });
      return new Response(JSON.stringify({ player: { id: 'p1', name: '张三' } }), { status: 200 });
    },
  });

  const player = await createD1GroupPlayer({ client, groupCode: 'lzscqjd', name: ' 张三 ' });

  assert.deepEqual(player, { id: 'p1', name: '张三' });
});

test('saveD1GroupPredictions posts selected score entries to the Worker', async () => {
  const client = createD1ApiClient({
    baseUrl: 'https://worldcup-api.example.workers.dev',
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://worldcup-api.example.workers.dev/api/groups/lzscqjd/predictions');
      assert.equal(init.method, 'POST');
      assert.deepEqual(JSON.parse(init.body), {
        playerId: 'p1',
        entries: [{ matchId: 'm1', scores: ['1-0', '2-1'] }],
      });
      return new Response(JSON.stringify({ ok: true, rowsWritten: 1 }), { status: 200 });
    },
  });

  const result = await saveD1GroupPredictions({
    client,
    groupCode: 'lzscqjd',
    playerId: 'p1',
    entries: [{ matchId: 'm1', scores: ['1-0', 2, '2-1'] }],
  });

  assert.deepEqual(result, { ok: true, rowsWritten: 1 });
});

test('loadD1LiveBoard reads a dated live window from the Worker', async () => {
  const client = createD1ApiClient({
    baseUrl: 'https://worldcup-api.example.workers.dev',
    fetchImpl: async (url) => {
      assert.equal(url, 'https://worldcup-api.example.workers.dev/api/live-board?from=2026-06-30&to=2026-07-02');
      return new Response(JSON.stringify({
        generatedAt: '2026-06-30T10:00:00.000Z',
        window: { from: '2026-06-30', to: '2026-07-02' },
        matches: [{ id: 'm1', date: '2026-06-30', time: '01:00', home: '巴西', away: '日本' }],
        scoreOddsByMatch: { m1: [{ score: '1-0', odds: 7.2 }] },
        aiRecommendationsByMatch: { m1: { scores: ['1-0'] } },
        importReports: [{ id: 'r1', jobName: 'live-d1' }],
      }), { status: 200 });
    },
  });

  const liveBoard = await loadD1LiveBoard({ client, from: '2026-06-30', to: '2026-07-02' });

  assert.deepEqual(liveBoard.matches, [{ id: 'm1', date: '2026-06-30', time: '01:00', home: '巴西', away: '日本' }]);
  assert.deepEqual(liveBoard.scoreOddsByMatch.m1, [{ score: '1-0', odds: 7.2 }]);
  assert.deepEqual(liveBoard.importReports, [{ id: 'r1', jobName: 'live-d1' }]);
});
