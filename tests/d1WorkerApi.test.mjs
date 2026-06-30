import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../workers/d1-api.mjs';

test('D1 worker health endpoint returns ok with CORS headers', async () => {
  const response = await worker.fetch(new Request('https://api.example.com/api/health'), { DB: fakeDb() });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(body, { ok: true });
});

test('D1 worker returns group state with ordered players and prediction rows', async () => {
  const db = fakeDb({
    group: { id: 'g1', code: 'lzscqjd', name: 'lzscqjd' },
    players: [
      { id: 'p2', name: '李四', created_at: '2026-06-12T10:02:00Z' },
      { id: 'p1', name: '张三', created_at: '2026-06-12T10:01:00Z' },
    ],
    predictions: [
      { player_id: 'p1', match_id: 'm1', scores: '["1-0","2-1"]' },
      { player_id: 'p2', match_id: 'm1', scores: 'not json' },
    ],
  });

  const response = await worker.fetch(new Request('https://api.example.com/api/groups/lzscqjd/state'), { DB: db });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    group: { id: 'g1', code: 'lzscqjd', name: 'lzscqjd' },
    players: [
      { id: 'p1', name: '张三' },
      { id: 'p2', name: '李四' },
    ],
    predictions: [
      { player_id: 'p1', match_id: 'm1', scores: ['1-0', '2-1'] },
      { player_id: 'p2', match_id: 'm1', scores: [] },
    ],
  });
});

test('D1 worker returns 404 for a missing group', async () => {
  const response = await worker.fetch(new Request('https://api.example.com/api/groups/missing/state'), { DB: fakeDb() });
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(body, { error: 'group_not_found' });
});

function fakeDb({ group = null, players = [], predictions = [] } = {}) {
  return {
    prepare(sql) {
      return {
        bound: [],
        bind(...values) {
          this.bound = values;
          return this;
        },
        async first() {
          if (sql.includes('from groups')) return group;
          throw new Error(`Unexpected first query: ${sql}`);
        },
        async all() {
          if (sql.includes('from players')) return { results: players };
          if (sql.includes('from predictions')) return { results: predictions };
          throw new Error(`Unexpected all query: ${sql}`);
        },
      };
    },
  };
}
