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

test('D1 worker returns a small live board window with odds and recommendations', async () => {
  const db = fakeLiveBoardDb();

  const response = await worker.fetch(new Request('https://api.example.com/api/live-board?from=2026-06-30&to=2026-07-02'), { DB: db });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.window, { from: '2026-06-30', to: '2026-07-02' });
  assert.deepEqual(body.matches, [
    {
      id: 'espn-1',
      matchCode: 'espn-1',
      date: '2026-06-30',
      time: '01:00',
      home: '巴西',
      away: '日本',
      homeScore: 2,
      awayScore: 1,
      status: 'post',
      statusDetail: 'Final',
      venue: '',
      stage: 'Round of 32',
    },
  ]);
  assert.deepEqual(body.scoreOddsByMatch['espn-1'], [
    {
      score: '2-1',
      odds: 5.8,
      trend: {
        firstOdds: 6.5,
        latestOdds: 5.8,
        changePct: -10.8,
        snapshotsCount: 3,
      },
    },
  ]);
  assert.deepEqual(body.aiRecommendationsByMatch['espn-1'].scores, ['2-1']);
});

test('D1 worker keeps pre-match null scores as null in live board responses', async () => {
  const db = fakeLiveBoardDb({
    matches: [{
      match_code: 'espn-pre',
      match_date_cn: '2026-07-01',
      time_cn: '01:00',
      home_cn: '科特迪瓦',
      away_cn: '挪威',
      home_score: null,
      away_score: null,
      status: 'pre',
      status_detail: 'Scheduled',
      stage: 'Round of 32',
    }],
  });

  const response = await worker.fetch(new Request('https://api.example.com/api/live-board?from=2026-07-01&to=2026-07-01'), { DB: db });
  const body = await response.json();

  assert.equal(body.matches[0].homeScore, null);
  assert.equal(body.matches[0].awayScore, null);
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

function fakeLiveBoardDb(overrides = {}) {
  const liveMatches = overrides.matches || [{
    match_code: 'espn-1',
    match_date_cn: '2026-06-30',
    time_cn: '01:00',
    home_cn: '巴西',
    away_cn: '日本',
    home_score: 2,
    away_score: 1,
    status: 'post',
    status_detail: 'Final',
    stage: 'Round of 32',
  }];
  return {
    prepare(sql) {
      return {
        bound: [],
        bind(...values) {
          this.bound = values;
          return this;
        },
        async all() {
          if (sql.includes('from matches')) {
            return {
              results: liveMatches,
            };
          }
          if (sql.includes('from score_odds_trends')) {
            return {
              results: [{
                home: '巴西',
                away: '日本',
                kickoff_label: '06-30 01:00',
                score: '2-1',
                first_odds: 6.5,
                latest_odds: 5.8,
                change_pct: -10.8,
                snapshots_count: 3,
              }],
            };
          }
          if (sql.includes('from score_odds')) {
            return {
              results: [{
                home: '巴西',
                away: '日本',
                kickoff_label: '06-30 01:00',
                score: '2-1',
                odds: 5.8,
              }],
            };
          }
          if (sql.includes('from ai_recommendations')) {
            return {
              results: [{
                match_id: 'espn-1',
                scores: '["2-1"]',
                score_labels: '["2-1(5.8)"]',
                strategy_id: 's1',
                strategy_name: '稳定型',
                strategy_roi: 12.3,
                strategy_roi_label: '+12.3%',
                strategy_feature: '低比分',
                router_reason: '窗口测试',
                match_reason_summary: '巴西优势',
                match_reason_detail: '预计概率和赔率匹配。',
                prediction_summary: '推荐 2-1。',
                prediction_run_id: 'run-1',
                predicted_at: '2026-06-30T00:00:00.000Z',
              }],
            };
          }
          if (sql.includes('from import_reports')) {
            return { results: [] };
          }
          throw new Error(`Unexpected all query: ${sql}`);
        },
      };
    },
  };
}
