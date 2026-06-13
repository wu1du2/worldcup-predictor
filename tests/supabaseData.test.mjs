import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getGroupCodeFromSearch,
  loadImportReports,
  loadScoreOdds,
  loadMatches,
  mapScoreOddsByMatch,
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
      home_team: { name_cn: '墨西哥队', name_en: 'Mexico' },
      away_team: { name_cn: '南非队', name_en: 'South Africa' },
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
      home: '墨西哥队',
      away: '南非队',
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
      'id,match_code,kickoff_at_utc,match_date_cn,time_cn,home,away,home_cn,away_cn,home_score,away_score,status,status_detail,venue,stage,home_team:teams!matches_home_team_id_fkey(name_en,name_cn),away_team:teams!matches_away_team_id_fkey(name_en,name_cn)',
    ],
    ['eq', 'active', true],
    ['order', 'kickoff_at_utc', { ascending: true }],
  ]);
});

test('mapScoreOddsByMatch joins odds to app matches by Chinese teams and China kickoff label', () => {
  const matches = [
    {
      id: 'espn-1',
      date: '2026-06-13',
      time: '03:00',
      home: '加拿大',
      away: '波黑',
    },
  ];
  const oddsRows = [
    {
      home: '加拿大',
      away: '波黑',
      kickoff_label: '06-13 03:00',
      score: '2-1',
      odds: 5.3,
    },
    {
      home: '加拿大',
      away: '波黑',
      kickoff_label: '06-13 03:00',
      score: '1-0',
      odds: 5.1,
    },
  ];

  assert.deepEqual(mapScoreOddsByMatch(matches, oddsRows), {
    'espn-1': [
      { score: '1-0', odds: 5.1 },
      { score: '2-1', odds: 5.3 },
      { score: '其他' },
    ],
  });
});

test('loadScoreOdds reads score_odds and returns match-keyed options', async () => {
  const calls = [];
  const rows = [
    {
      home: '加拿大',
      away: '波黑',
      kickoff_label: '06-13 03:00',
      score: '1-0',
      odds: 5.1,
    },
  ];
  const client = {
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          calls.push(['select', columns]);
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

  const odds = await loadScoreOdds({
    client,
    matches: [{ id: 'm1', date: '2026-06-13', time: '03:00', home: '加拿大', away: '波黑' }],
  });

  assert.deepEqual(odds, {
    m1: [
      { score: '1-0', odds: 5.1 },
      { score: '其他' },
    ],
  });
  assert.deepEqual(calls, [
    ['from', 'score_odds'],
    ['select', 'home,away,kickoff_label,score,odds'],
    ['order', 'source_match_key', { ascending: true }],
  ]);
});

test('loadImportReports reads recent backend reports ordered by creation time', async () => {
  const calls = [];
  const rows = [
    {
      id: 'r1',
      job_name: 'odds',
      status: 'failed',
      started_at: '2026-06-13T00:00:00.000Z',
      finished_at: '2026-06-13T00:01:00.000Z',
      rows_written: 0,
      items_seen: 0,
      message: 'parse failed',
      error_detail: 'No score odds matches parsed.',
      run_url: 'https://github.com/run/1',
      created_at: '2026-06-13T00:01:00.000Z',
    },
  ];
  const client = {
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          calls.push(['select', columns]);
          return {
            order(columnName, options) {
              calls.push(['order', columnName, options]);
              return {
                limit(count) {
                  calls.push(['limit', count]);
                  return Promise.resolve({ data: rows, error: null });
                },
              };
            },
          };
        },
      };
    },
  };

  assert.deepEqual(await loadImportReports({ client, limit: 6 }), [
    {
      id: 'r1',
      jobName: 'odds',
      status: 'failed',
      startedAt: '2026-06-13T00:00:00.000Z',
      finishedAt: '2026-06-13T00:01:00.000Z',
      rowsWritten: 0,
      itemsSeen: 0,
      message: 'parse failed',
      errorDetail: 'No score odds matches parsed.',
      runUrl: 'https://github.com/run/1',
      createdAt: '2026-06-13T00:01:00.000Z',
    },
  ]);
  assert.deepEqual(calls, [
    ['from', 'import_reports'],
    ['select', 'id,job_name,status,started_at,finished_at,rows_written,items_seen,message,error_detail,run_url,created_at'],
    ['order', 'created_at', { ascending: false }],
    ['limit', 6],
  ]);
});
