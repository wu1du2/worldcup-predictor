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

test('D1 worker returns Quarterfinals advancement ties and group predictions', async () => {
  const db = fakeStatefulDb({
    groups: [{ id: 'g1', code: 'lzscqjd', name: 'lzscqjd', created_at: '2026-06-12T00:00:00.000Z' }],
    players: [{ id: 'p1', group_id: 'g1', name: '张三', created_at: '2026-06-12T00:01:00.000Z' }],
    matches: [
      quarterfinalMatch({ match_code: 'espn-760502', match_date_cn: '2026-07-05', time_cn: '01:00', kickoff_at_utc: '2026-07-04T17:00:00.000Z', home_cn: '加拿大', away_cn: '摩洛哥', home_score: 0, away_score: 3, status: 'post', status_detail: 'FT' }),
      quarterfinalMatch({ match_code: 'espn-760503', match_date_cn: '2026-07-05', time_cn: '05:00', kickoff_at_utc: '2026-07-04T21:00:00.000Z', home_cn: '巴拉圭', away_cn: '法国' }),
    ],
    advancementPredictions: [
      { group_id: 'g1', player_id: 'p1', match_id: 'espn-760502', winner_side: 'away', winner_name: '摩洛哥', updated_at: '2026-07-04T00:00:00.000Z' },
    ],
  });

  const response = await worker.fetch(new Request('https://api.example.com/api/groups/lzscqjd/advancement-predictions'), {
    DB: db,
    TEST_NOW: '2026-07-04T16:00:00.000Z',
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.ties, [
    {
      matchId: 'espn-760502',
      date: '2026-07-05',
      time: '01:00',
      kickoffAtUtc: '2026-07-04T17:00:00.000Z',
      home: '加拿大',
      away: '摩洛哥',
      homeScore: 0,
      awayScore: 3,
      status: 'post',
      locked: false,
    },
    {
      matchId: 'espn-760503',
      date: '2026-07-05',
      time: '05:00',
      kickoffAtUtc: '2026-07-04T21:00:00.000Z',
      home: '巴拉圭',
      away: '法国',
      homeScore: null,
      awayScore: null,
      status: 'pre',
      locked: false,
    },
  ]);
  assert.deepEqual(body.predictions, [
    { playerId: 'p1', matchId: 'espn-760502', winnerSide: 'away', winnerName: '摩洛哥' },
  ]);
});

test('D1 worker saves partial advancement predictions before the lock time', async () => {
  const db = fakeStatefulDb({
    groups: [{ id: 'g1', code: 'lzscqjd', name: 'lzscqjd', created_at: '2026-06-12T00:00:00.000Z' }],
    players: [{ id: 'p1', group_id: 'g1', name: '张三', created_at: '2026-06-12T00:01:00.000Z' }],
    matches: [
      quarterfinalMatch({ match_code: 'espn-760502', kickoff_at_utc: '2026-07-04T17:00:00.000Z', home_cn: '加拿大', away_cn: '摩洛哥' }),
      quarterfinalMatch({ match_code: 'espn-760503', kickoff_at_utc: '2026-07-04T21:00:00.000Z', home_cn: '巴拉圭', away_cn: '法国' }),
    ],
  });

  const response = await worker.fetch(new Request('https://api.example.com/api/groups/lzscqjd/advancement-predictions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      playerId: 'p1',
      entries: [
        { matchId: 'espn-760502', winnerSide: 'home' },
        { matchId: 'espn-760503', winnerSide: 'away' },
      ],
    }),
  }), {
    DB: db,
    TEST_NOW: '2026-07-04T16:30:00.000Z',
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, rowsWritten: 2 });
  assert.deepEqual(db.state.advancementPredictions.map((row) => ({
    group_id: row.group_id,
    player_id: row.player_id,
    match_id: row.match_id,
    winner_side: row.winner_side,
    winner_name: row.winner_name,
  })), [
    { group_id: 'g1', player_id: 'p1', match_id: 'espn-760502', winner_side: 'home', winner_name: '加拿大' },
    { group_id: 'g1', player_id: 'p1', match_id: 'espn-760503', winner_side: 'away', winner_name: '法国' },
  ]);
});

test('D1 worker rejects advancement prediction changes inside the 15 minute lock window', async () => {
  const db = fakeStatefulDb({
    groups: [{ id: 'g1', code: 'lzscqjd', name: 'lzscqjd', created_at: '2026-06-12T00:00:00.000Z' }],
    players: [{ id: 'p1', group_id: 'g1', name: '张三', created_at: '2026-06-12T00:01:00.000Z' }],
    matches: [
      quarterfinalMatch({ match_code: 'espn-760502', kickoff_at_utc: '2026-07-04T17:00:00.000Z', home_cn: '加拿大', away_cn: '摩洛哥' }),
    ],
  });

  const response = await worker.fetch(new Request('https://api.example.com/api/groups/lzscqjd/advancement-predictions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      playerId: 'p1',
      entries: [{ matchId: 'espn-760502', winnerSide: 'away' }],
    }),
  }), {
    DB: db,
    TEST_NOW: '2026-07-04T16:45:00.000Z',
  });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error, 'advancement_locked');
  assert.deepEqual(db.state.advancementPredictions, []);
});

test('D1 worker returns handicap challenge matches and group predictions', async () => {
  const db = fakeStatefulDb({
    groups: [{ id: 'g1', code: 'lzscqjd', name: 'lzscqjd', created_at: '2026-06-12T00:00:00.000Z' }],
    players: [{ id: 'p1', group_id: 'g1', name: '张三', created_at: '2026-06-12T00:01:00.000Z' }],
    handicapMatches: [
      handicapMatch({ match_id: 'hc-france-morocco', match_code: 'espn-france-morocco', home_cn: '法国', away_cn: '摩洛哥' }),
    ],
    matches: [
      quarterfinalMatch({ match_code: 'espn-france-morocco', home_cn: '法国', away_cn: '摩洛哥', home_score: 2, away_score: 0, status: 'post' }),
    ],
    handicapPredictions: [
      { group_id: 'g1', player_id: 'p1', match_id: 'hc-france-morocco', choice_key: 'win', updated_at: '2026-07-09T00:00:00.000Z' },
    ],
  });

  const response = await worker.fetch(new Request('https://api.example.com/api/groups/lzscqjd/handicap-challenge'), {
    DB: db,
    TEST_NOW: '2026-07-09T08:00:00.000Z',
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.matches, [{
    matchId: 'hc-france-morocco',
    matchCode: 'espn-france-morocco',
    issue: '周四097',
    date: '2026-07-10',
    time: '04:00',
    kickoffAtUtc: '2026-07-09T20:00:00.000Z',
    home: '法国',
    away: '摩洛哥',
    handicap: -1,
    odds: { win: 2.48, draw: 3.05, loss: 2.51 },
    probabilities: { win: 0.357, draw: 0.29, loss: 0.353 },
    homeScore: 2,
    awayScore: 0,
    status: 'post',
    locked: false,
  }]);
  assert.deepEqual(body.predictions, [
    { playerId: 'p1', matchId: 'hc-france-morocco', choiceKey: 'win' },
  ]);
});

test('D1 worker saves handicap challenge picks before the lock time', async () => {
  const db = fakeStatefulDb({
    groups: [{ id: 'g1', code: 'lzscqjd', name: 'lzscqjd', created_at: '2026-06-12T00:00:00.000Z' }],
    players: [{ id: 'p1', group_id: 'g1', name: '张三', created_at: '2026-06-12T00:01:00.000Z' }],
    handicapMatches: [
      handicapMatch({ match_id: 'hc-france-morocco', kickoff_at_utc: '2026-07-09T20:00:00.000Z' }),
      handicapMatch({ match_id: 'hc-spain-belgium', kickoff_at_utc: '2026-07-10T19:00:00.000Z', home_cn: '西班牙', away_cn: '比利时' }),
    ],
  });

  const response = await worker.fetch(new Request('https://api.example.com/api/groups/lzscqjd/handicap-challenge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      playerId: 'p1',
      entries: [
        { matchId: 'hc-france-morocco', choiceKey: 'win' },
        { matchId: 'hc-spain-belgium', choiceKey: 'loss' },
      ],
    }),
  }), {
    DB: db,
    TEST_NOW: '2026-07-09T19:40:00.000Z',
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, rowsWritten: 2 });
  assert.deepEqual(db.state.handicapPredictions.map((row) => ({
    group_id: row.group_id,
    player_id: row.player_id,
    match_id: row.match_id,
    choice_key: row.choice_key,
  })), [
    { group_id: 'g1', player_id: 'p1', match_id: 'hc-france-morocco', choice_key: 'win' },
    { group_id: 'g1', player_id: 'p1', match_id: 'hc-spain-belgium', choice_key: 'loss' },
  ]);
});

test('D1 worker rejects handicap challenge changes inside the 15 minute lock window', async () => {
  const db = fakeStatefulDb({
    groups: [{ id: 'g1', code: 'lzscqjd', name: 'lzscqjd', created_at: '2026-06-12T00:00:00.000Z' }],
    players: [{ id: 'p1', group_id: 'g1', name: '张三', created_at: '2026-06-12T00:01:00.000Z' }],
    handicapMatches: [
      handicapMatch({ match_id: 'hc-france-morocco', kickoff_at_utc: '2026-07-09T20:00:00.000Z' }),
    ],
  });

  const response = await worker.fetch(new Request('https://api.example.com/api/groups/lzscqjd/handicap-challenge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      playerId: 'p1',
      entries: [{ matchId: 'hc-france-morocco', choiceKey: 'loss' }],
    }),
  }), {
    DB: db,
    TEST_NOW: '2026-07-09T19:45:00.000Z',
  });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error, 'handicap_challenge_locked');
  assert.deepEqual(db.state.handicapPredictions, []);
});

test('D1 worker returns champion road teams and group rankings', async () => {
  const db = fakeStatefulDb({
    groups: [{ id: 'g1', code: 'lzscqjd', name: 'lzscqjd', created_at: '2026-06-12T00:00:00.000Z' }],
    players: [{ id: 'p1', group_id: 'g1', name: '张三', created_at: '2026-06-12T00:01:00.000Z' }],
    matches: [
      semifinalMatch({ match_code: 'espn-760514', home_cn: '法国', away_cn: '西班牙', kickoff_at_utc: '2026-07-14T19:00:00.000Z' }),
      semifinalMatch({ match_code: 'espn-760515', match_date_cn: '2026-07-16', home_cn: '英格兰', away_cn: '阿根廷', kickoff_at_utc: '2026-07-15T19:00:00.000Z' }),
    ],
    championRoadPredictions: [
      { group_id: 'g1', player_id: 'p1', ranking: '["法国","阿根廷","西班牙","英格兰"]', updated_at: '2026-07-13T00:00:00.000Z' },
    ],
  });

  const response = await worker.fetch(new Request('https://api.example.com/api/groups/lzscqjd/champion-road'), {
    DB: db,
    TEST_NOW: '2026-07-13T00:00:00.000Z',
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.teams, [
    { teamKey: '法国', name: '法国' },
    { teamKey: '西班牙', name: '西班牙' },
    { teamKey: '英格兰', name: '英格兰' },
    { teamKey: '阿根廷', name: '阿根廷' },
  ]);
  assert.equal(body.locked, false);
  assert.equal(body.lockAtUtc, '2026-07-14T18:45:00.000Z');
  assert.deepEqual(body.predictions, [
    { playerId: 'p1', ranking: ['法国', '阿根廷', '西班牙', '英格兰'] },
  ]);
});

test('D1 worker saves champion road ranking before first semifinal lock', async () => {
  const db = fakeStatefulDb({
    groups: [{ id: 'g1', code: 'lzscqjd', name: 'lzscqjd', created_at: '2026-06-12T00:00:00.000Z' }],
    players: [{ id: 'p1', group_id: 'g1', name: '张三', created_at: '2026-06-12T00:01:00.000Z' }],
    matches: [
      semifinalMatch({ home_cn: '法国', away_cn: '西班牙', kickoff_at_utc: '2026-07-14T19:00:00.000Z' }),
      semifinalMatch({ match_code: 'espn-760515', match_date_cn: '2026-07-16', home_cn: '英格兰', away_cn: '阿根廷', kickoff_at_utc: '2026-07-15T19:00:00.000Z' }),
    ],
  });

  const response = await worker.fetch(new Request('https://api.example.com/api/groups/lzscqjd/champion-road', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      playerId: 'p1',
      ranking: ['阿根廷', '法国', '西班牙', '英格兰'],
    }),
  }), {
    DB: db,
    TEST_NOW: '2026-07-14T18:44:59.000Z',
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, rowsWritten: 1 });
  assert.deepEqual(db.state.championRoadPredictions.map((row) => ({
    group_id: row.group_id,
    player_id: row.player_id,
    ranking: row.ranking,
  })), [
    { group_id: 'g1', player_id: 'p1', ranking: '["阿根廷","法国","西班牙","英格兰"]' },
  ]);
});

test('D1 worker rejects champion road changes after first semifinal lock', async () => {
  const db = fakeStatefulDb({
    groups: [{ id: 'g1', code: 'lzscqjd', name: 'lzscqjd', created_at: '2026-06-12T00:00:00.000Z' }],
    players: [{ id: 'p1', group_id: 'g1', name: '张三', created_at: '2026-06-12T00:01:00.000Z' }],
    matches: [
      semifinalMatch({ home_cn: '法国', away_cn: '西班牙', kickoff_at_utc: '2026-07-14T19:00:00.000Z' }),
      semifinalMatch({ match_code: 'espn-760515', match_date_cn: '2026-07-16', home_cn: '英格兰', away_cn: '阿根廷', kickoff_at_utc: '2026-07-15T19:00:00.000Z' }),
    ],
  });

  const response = await worker.fetch(new Request('https://api.example.com/api/groups/lzscqjd/champion-road', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      playerId: 'p1',
      ranking: ['阿根廷', '法国', '西班牙', '英格兰'],
    }),
  }), {
    DB: db,
    TEST_NOW: '2026-07-14T18:45:00.000Z',
  });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error, 'champion_road_locked');
  assert.deepEqual(db.state.championRoadPredictions, []);
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
      settlementHomeScore: 2,
      settlementAwayScore: 1,
      settlementScoreSource: 'final',
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
  assert.deepEqual(body.aiStrategyStats, [{
    strategyId: 'tem_draw_anchor_lean_homeaway2_draw6_cap22',
    strategyName: '稳定型',
    matchesCount: 18,
    cost: 36,
    revenue: 31.5,
    profit: -4.5,
    roi: -12.5,
    updatedAt: '2026-06-30T08:00:00.000Z',
  }]);
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
  assert.equal(body.matches[0].settlementHomeScore, null);
  assert.equal(body.matches[0].settlementAwayScore, null);
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

function quarterfinalMatch(overrides = {}) {
  return {
    match_code: 'espn-r16',
    match_date_cn: '2026-07-05',
    time_cn: '01:00',
    kickoff_at_utc: '2026-07-04T17:00:00.000Z',
    home_cn: '加拿大',
    away_cn: '摩洛哥',
    status: 'pre',
    status_detail: 'Scheduled',
    stage: 'Quarterfinals',
    ...overrides,
  };
}

function handicapMatch(overrides = {}) {
  return {
    match_id: 'hc-france-morocco',
    match_code: 'espn-france-morocco',
    issue: '周四097',
    date_cn: '2026-07-10',
    time_cn: '04:00',
    kickoff_at_utc: '2026-07-09T20:00:00.000Z',
    home_cn: '法国',
    away_cn: '摩洛哥',
    handicap: -1,
    odds_win: 2.48,
    odds_draw: 3.05,
    odds_loss: 2.51,
    probability_win: 0.357,
    probability_draw: 0.29,
    probability_loss: 0.353,
    active: 1,
    updated_at: '2026-07-09T08:00:00.000Z',
    ...overrides,
  };
}

function semifinalMatch(overrides = {}) {
  return {
    match_code: 'espn-760514',
    match_date_cn: '2026-07-15',
    time_cn: '03:00',
    kickoff_at_utc: '2026-07-14T19:00:00.000Z',
    home_cn: '法国',
    away_cn: '西班牙',
    status: 'pre',
    status_detail: 'Scheduled',
    stage: 'Semifinals',
    active: 1,
    ...overrides,
  };
}

function fakeStatefulDb(initial = {}) {
  const state = {
    groups: [...(initial.groups || [])],
    players: [...(initial.players || [])],
    predictions: [...(initial.predictions || [])],
    matches: [...(initial.matches || [])],
    advancementPredictions: [...(initial.advancementPredictions || [])],
    handicapMatches: [...(initial.handicapMatches || [])],
    handicapPredictions: [...(initial.handicapPredictions || [])],
    championRoadPredictions: [...(initial.championRoadPredictions || [])],
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
          if (sql.includes('from advancement_predictions')) {
            const [groupId] = this.bound;
            return { results: state.advancementPredictions.filter((prediction) => prediction.group_id === groupId) };
          }
          if (sql.includes('from handicap_challenge_predictions')) {
            const [groupId] = this.bound;
            return { results: state.handicapPredictions.filter((prediction) => prediction.group_id === groupId) };
          }
          if (sql.includes('from champion_road_predictions')) {
            const [groupId] = this.bound;
            return { results: state.championRoadPredictions.filter((prediction) => prediction.group_id === groupId) };
          }
          if (sql.includes('from handicap_challenge_matches')) {
            return {
              results: state.handicapMatches
                .filter((match) => match.active !== 0)
                .map((match) => {
                  const liveMatch = state.matches.find((item) => item.match_code === match.match_code) || {};
                  return {
                    ...match,
                    home_score: liveMatch.home_score ?? null,
                    away_score: liveMatch.away_score ?? null,
                    settlement_home_score: liveMatch.settlement_home_score ?? null,
                    settlement_away_score: liveMatch.settlement_away_score ?? null,
                    status: liveMatch.status || 'pre',
                  };
                })
                .sort((a, b) => `${a.date_cn || ''} ${a.time_cn || ''}`.localeCompare(`${b.date_cn || ''} ${b.time_cn || ''}`)),
            };
          }
          if (sql.includes('from matches') && sql.includes('Quarterfinal')) {
            return {
              results: state.matches
                .filter((match) => match.stage === 'Quarterfinals' && match.active !== 0)
                .sort((a, b) => `${a.match_date_cn || ''} ${a.time_cn || ''}`.localeCompare(`${b.match_date_cn || ''} ${b.time_cn || ''}`)),
            };
          }
          if (sql.includes('from matches') && sql.includes('Semifinal')) {
            return {
              results: state.matches
                .filter((match) => match.stage === 'Semifinals' && match.active !== 0)
                .sort((a, b) => `${a.match_date_cn || ''} ${a.time_cn || ''}`.localeCompare(`${b.match_date_cn || ''} ${b.time_cn || ''}`)),
            };
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
          if (normalizedSql.startsWith('insert into advancement_predictions')) {
            const [id, groupId, playerId, matchId, winnerSide, winnerName, updatedAt] = this.bound;
            const existing = state.advancementPredictions.find((row) => (
              row.group_id === groupId && row.player_id === playerId && row.match_id === matchId
            ));
            if (existing) {
              existing.winner_side = winnerSide;
              existing.winner_name = winnerName;
              existing.updated_at = updatedAt;
            } else {
              state.advancementPredictions.push({
                id,
                group_id: groupId,
                player_id: playerId,
                match_id: matchId,
                winner_side: winnerSide,
                winner_name: winnerName,
                updated_at: updatedAt,
              });
            }
            return { success: true };
          }
          if (normalizedSql.startsWith('insert into handicap_challenge_predictions')) {
            const [id, groupId, playerId, matchId, choiceKey, updatedAt] = this.bound;
            const existing = state.handicapPredictions.find((row) => (
              row.group_id === groupId && row.player_id === playerId && row.match_id === matchId
            ));
            if (existing) {
              existing.choice_key = choiceKey;
              existing.updated_at = updatedAt;
            } else {
              state.handicapPredictions.push({
                id,
                group_id: groupId,
                player_id: playerId,
                match_id: matchId,
                choice_key: choiceKey,
                updated_at: updatedAt,
              });
            }
            return { success: true };
          }
          if (normalizedSql.startsWith('insert into champion_road_predictions')) {
            const [id, groupId, playerId, ranking, updatedAt] = this.bound;
            const existing = state.championRoadPredictions.find((row) => (
              row.group_id === groupId && row.player_id === playerId
            ));
            if (existing) {
              existing.ranking = ranking;
              existing.updated_at = updatedAt;
            } else {
              state.championRoadPredictions.push({
                id,
                group_id: groupId,
                player_id: playerId,
                ranking,
                updated_at: updatedAt,
              });
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
    settlement_home_score: 2,
    settlement_away_score: 1,
    settlement_score_source: 'final',
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
          if (sql.includes('from ai_strategy_stats')) {
            return {
              results: [{
                strategy_id: 'tem_draw_anchor_lean_homeaway2_draw6_cap22',
                strategy_name: '稳定型',
                matches_count: 18,
                cost: 36,
                revenue: 31.5,
                profit: -4.5,
                roi: -12.5,
                updated_at: '2026-06-30T08:00:00.000Z',
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
