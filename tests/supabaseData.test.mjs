import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getGroupCodeFromSearch,
  loadMatches,
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

test('loadMatches reads active matches sorted by kickoff and maps them for the app', async () => {
  const calls = [];
  const rows = [
    {
      id: 'legacy-row',
      match_code: null,
      kickoff_at_utc: null,
      match_date_cn: null,
      time_cn: null,
      home: null,
      away: null,
      home_score: null,
      away_score: null,
      status: 'pre',
      status_detail: null,
      venue: null,
      stage: null,
    },
    {
      id: 'row-1',
      match_code: 'espn-760415',
      kickoff_at_utc: '2026-06-11T19:00:00.000Z',
      match_date_cn: '2026-06-12',
      time_cn: '03:00',
      home: 'Mexico',
      away: 'South Africa',
      home_cn: '墨西哥',
      away_cn: '南非',
      home_score: 2,
      away_score: 0,
      status: 'post',
      status_detail: 'FT',
      venue: 'Estadio Banorte, Mexico City, Mexico',
      stage: 'Group Stage',
    },
  ];
  const client = {
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          calls.push(['select', columns]);
          return {
            eq(column, value) {
              calls.push(['eq', column, value]);
              return {
                order(columnName, options) {
                  calls.push(['order', columnName, options]);
                  return Promise.resolve({ data: rows, error: null });
                },
              };
            },
          };
        },
      };
    },
  };

  const matches = await loadMatches({ client });

  assert.deepEqual(matches, [
    {
      id: 'espn-760415',
      matchCode: 'espn-760415',
      date: '2026-06-12',
      time: '03:00',
      home: '墨西哥',
      away: '南非',
      homeScore: 2,
      awayScore: 0,
      status: 'post',
      statusDetail: 'FT',
      venue: 'Estadio Banorte, Mexico City, Mexico',
      stage: 'Group Stage',
    },
  ]);
  assert.deepEqual(calls, [
    ['from', 'matches'],
    [
      'select',
      'id,match_code,kickoff_at_utc,match_date_cn,time_cn,home,away,home_cn,away_cn,home_score,away_score,status,status_detail,venue,stage',
    ],
    ['eq', 'active', true],
    ['order', 'kickoff_at_utc', { ascending: true }],
  ]);
});
