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

test('D1 worker creates an empty group state for a missing group', async () => {
  const db = fakeStatefulDb();
  const response = await worker.fetch(new Request('https://api.example.com/api/groups/missing/state'), { DB: db });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.group.code, 'missing');
  assert.deepEqual(body.players, [{ id: body.players[0].id, name: 'AI推荐' }]);
  assert.deepEqual(body.predictions, []);
});

test('D1 worker creates a group player through the write API', async () => {
  const db = fakeStatefulDb();

  const response = await worker.fetch(new Request('https://api.example.com/api/groups/newgrp/players', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: ' 张三 ' }),
  }), { DB: db });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.group.code, 'newgrp');
  assert.equal(body.player.name, '张三');
  assert.equal(db.state.groups.length, 1);
  assert.deepEqual(db.state.players.map((player) => player.name).sort(), ['AI推荐', '张三']);
});

test('D1 worker upserts predictions for a group player', async () => {
  const db = fakeStatefulDb({
    groups: [{ id: 'g1', code: 'lzscqjd', name: 'lzscqjd', created_at: '2026-06-12T00:00:00.000Z' }],
    players: [
      { id: 'p1', group_id: 'g1', name: '张三', created_at: '2026-06-12T00:01:00.000Z' },
    ],
  });

  const response = await worker.fetch(new Request('https://api.example.com/api/groups/lzscqjd/predictions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      playerId: 'p1',
      entries: [
        { matchId: 'm1', scores: ['1-0', '2-1', 3] },
        { matchId: 'm2', scores: [] },
      ],
    }),
  }), { DB: db });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, rowsWritten: 2 });
  assert.deepEqual(db.state.predictions.map((row) => ({
    group_id: row.group_id,
    player_id: row.player_id,
    match_id: row.match_id,
    scores: row.scores,
  })), [
    { group_id: 'g1', player_id: 'p1', match_id: 'm1', scores: '["1-0","2-1"]' },
    { group_id: 'g1', player_id: 'p1', match_id: 'm2', scores: '[]' },
  ]);
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

function fakeStatefulDb(initial = {}) {
  const state = {
    groups: [...(initial.groups || [])],
    players: [...(initial.players || [])],
    predictions: [...(initial.predictions || [])],
  };

  return {
    state,
    prepare(sql) {
      return {
        bound: [],
        bind(...values) {
          this.bound = values;
          return this;
        },
        async first() {
          if (sql.includes('from groups')) {
            const [code] = this.bound;
            return state.groups.find((group) => group.code === code) || null;
          }
          if (sql.includes('from players') && sql.includes('name = ?')) {
            const [groupId, name] = this.bound;
            return state.players.find((player) => player.group_id === groupId && player.name === name) || null;
          }
          if (sql.includes('from players') && sql.includes('id = ?')) {
            const [id, groupId] = this.bound;
            return state.players.find((player) => player.id === id && player.group_id === groupId) || null;
          }
          throw new Error(`Unexpected first query: ${sql}`);
        },
        async all() {
          if (sql.includes('from players')) {
            const [groupId] = this.bound;
            return { results: state.players.filter((player) => player.group_id === groupId) };
          }
          if (sql.includes('from predictions')) {
            const [groupId] = this.bound;
            return { results: state.predictions.filter((prediction) => prediction.group_id === groupId) };
          }
          throw new Error(`Unexpected all query: ${sql}`);
        },
        async run() {
          const normalizedSql = sql.trim();
          if (normalizedSql.startsWith('insert into groups')) {
            const [id, code, name, createdAt] = this.bound;
            if (!state.groups.some((group) => group.code === code)) {
              state.groups.push({ id, code, name, created_at: createdAt });
            }
            return { success: true };
          }
          if (normalizedSql.startsWith('insert into players')) {
            const [id, groupId, name, createdAt] = this.bound;
            if (!state.players.some((player) => player.group_id === groupId && player.name === name)) {
              state.players.push({ id, group_id: groupId, name, created_at: createdAt });
            }
            return { success: true };
          }
          if (normalizedSql.startsWith('insert into predictions')) {
            const [id, groupId, playerId, matchId, scores, updatedAt] = this.bound;
            const existing = state.predictions.find((row) => (
              row.group_id === groupId && row.player_id === playerId && row.match_id === matchId
            ));
            if (existing) {
              existing.scores = scores;
              existing.updated_at = updatedAt;
            } else {
              state.predictions.push({ id, group_id: groupId, player_id: playerId, match_id: matchId, scores, updated_at: updatedAt });
            }
            return { success: true };
          }
          throw new Error(`Unexpected run query: ${sql}`);
        },
      };
    },
  };
}
