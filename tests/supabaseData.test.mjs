import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aiPlayerName,
  ensureAiPlayer,
  generateGroupCode,
  getGroupByCode,
  getGroupCodeFromSearch,
  loadAiRecommendations,
  loadAiStrategyStats,
  loadImportReports,
  loadScoreOdds,
  loadMatches,
  mapAiRecommendationsByMatch,
  mapScoreOddsByMatch,
  mapPredictionsByPlayer,
  mergePlayers,
  submitAiUserStrategy,
} from '../src/supabaseData.mjs';

test('getGroupCodeFromSearch reads group query param and falls back to default', () => {
  assert.equal(getGroupCodeFromSearch('?group=wx-football'), 'wx-football');
  assert.equal(getGroupCodeFromSearch('?group=%E7%90%83%E5%8F%8B'), '球友');
  assert.equal(getGroupCodeFromSearch('?group='), 'default');
  assert.equal(getGroupCodeFromSearch(''), null);
});

test('generateGroupCode returns a six character lowercase letter and number code', () => {
  assert.match(generateGroupCode(() => 0), /^[a-z0-9]{6}$/);
  assert.equal(generateGroupCode(() => 0), 'aaaaaa');
  assert.equal(generateGroupCode(() => 0.999), '999999');
});

test('mergePlayers returns only group-specific database players', () => {
  const merged = mergePlayers([
    { id: 'db-p01', name: '阿哲' },
    { id: 'db-custom', name: '小吴' },
  ]);

  assert.deepEqual(merged, [
    { id: 'ai-player', name: 'AI推荐', isAi: true },
    { id: 'db-p01', name: '阿哲' },
    { id: 'db-custom', name: '小吴' },
  ]);
});

test('mergePlayers keeps existing AI player first without duplicating it', () => {
  const merged = mergePlayers([
    { id: 'db-p01', name: '阿哲' },
    { id: 'db-ai', name: aiPlayerName },
    { id: 'db-custom', name: '小吴' },
  ]);

  assert.deepEqual(merged, [
    { id: 'db-ai', name: 'AI推荐', isAi: true },
    { id: 'db-p01', name: '阿哲' },
    { id: 'db-custom', name: '小吴' },
  ]);
});

test('ensureAiPlayer returns existing AI player or creates one for the group', async () => {
  const calls = [];
  const existingClient = {
    from(table) {
      calls.push(['from', table]);
      assert.equal(table, 'players');
      return {
        select(columns) {
          calls.push(['select', columns]);
          return {
            eq(column, value) {
              calls.push(['eq', column, value]);
              return {
                eq(column2, value2) {
                  calls.push(['eq', column2, value2]);
                  return {
                    maybeSingle() {
                      calls.push(['maybeSingle']);
                      return Promise.resolve({ data: { id: 'db-ai', name: aiPlayerName }, error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  assert.deepEqual(await ensureAiPlayer({ client: existingClient, groupId: 'g1' }), {
    id: 'db-ai',
    name: 'AI推荐',
  });
  assert.deepEqual(calls, [
    ['from', 'players'],
    ['select', 'id,name'],
    ['eq', 'group_id', 'g1'],
    ['eq', 'name', 'AI推荐'],
    ['maybeSingle'],
  ]);

  const createCalls = [];
  const createClient = {
    from(table) {
      createCalls.push(['from', table]);
      return {
        select(columns) {
          createCalls.push(['select', columns]);
          return {
            eq(column, value) {
              createCalls.push(['eq', column, value]);
              return {
                eq(column2, value2) {
                  createCalls.push(['eq', column2, value2]);
                  return {
                    maybeSingle() {
                      createCalls.push(['maybeSingle']);
                      return Promise.resolve({ data: null, error: null });
                    },
                  };
                },
              };
            },
          };
        },
        insert(row) {
          createCalls.push(['insert', row]);
          return {
            select(columns) {
              createCalls.push(['select', columns]);
              return {
                single() {
                  createCalls.push(['single']);
                  return Promise.resolve({ data: { id: 'new-ai', name: aiPlayerName }, error: null });
                },
              };
            },
          };
        },
      };
    },
  };

  assert.deepEqual(await ensureAiPlayer({ client: createClient, groupId: 'g2' }), {
    id: 'new-ai',
    name: 'AI推荐',
  });
  assert.deepEqual(createCalls, [
    ['from', 'players'],
    ['select', 'id,name'],
    ['eq', 'group_id', 'g2'],
    ['eq', 'name', 'AI推荐'],
    ['maybeSingle'],
    ['from', 'players'],
    ['insert', { group_id: 'g2', name: 'AI推荐' }],
    ['select', 'id,name'],
    ['single'],
  ]);
});

test('getGroupByCode returns or creates a group by URL code', async () => {
  const calls = [];
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
                maybeSingle() {
                  calls.push(['maybeSingle']);
                  return Promise.resolve({ data: null, error: null });
                },
              };
            },
          };
        },
        insert(row) {
          calls.push(['insert', row]);
          return {
            select(columns) {
              calls.push(['select', columns]);
              return {
                single() {
                  calls.push(['single']);
                  return Promise.resolve({ data: { id: 'g-new', code: 'wx-ai', name: 'wx-ai' }, error: null });
                },
              };
            },
          };
        },
      };
    },
  };

  assert.deepEqual(await getGroupByCode({ client, groupCode: 'wx-ai' }), {
    id: 'g-new',
    code: 'wx-ai',
    name: 'wx-ai',
  });
  assert.deepEqual(calls, [
    ['from', 'groups'],
    ['select', 'id,code,name'],
    ['eq', 'code', 'wx-ai'],
    ['maybeSingle'],
    ['from', 'groups'],
    ['insert', { code: 'wx-ai', name: 'wx-ai' }],
    ['select', 'id,code,name'],
    ['single'],
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

test('mapPredictionsByPlayer ignores malformed score arrays from database rows', () => {
  const rows = [
    { player_id: 'player-a', match_id: 'm01', scores: '1-0' },
    { player_id: 'player-a', match_id: 'm02', scores: ['0-0', 5, null] },
    { player_id: 'player-b', match_id: 'm01', scores: null },
  ];

  assert.deepEqual(mapPredictionsByPlayer(rows), {
    'player-a': {
      m01: [],
      m02: ['0-0'],
    },
    'player-b': {
      m01: [],
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
    {
      home: '加拿大',
      away: '波黑',
      kickoff_label: '06-13 03:00',
      score: '胜其他',
      odds: 100,
    },
    {
      home: '加拿大',
      away: '波黑',
      kickoff_label: '06-13 03:00',
      score: '平其他',
      odds: 500,
    },
    {
      home: '加拿大',
      away: '波黑',
      kickoff_label: '06-13 03:00',
      score: '负其他',
      odds: 400,
    },
  ];

  assert.deepEqual(mapScoreOddsByMatch(matches, oddsRows), {
    'espn-1': [
      { score: '1-0', odds: 5.1 },
      { score: '2-1', odds: 5.3 },
      { score: '胜其他', odds: 100 },
      { score: '平其他', odds: 500 },
      { score: '负其他', odds: 400 },
    ],
  });
});

test('mapScoreOddsByMatch merges first-to-latest trend data into score options', () => {
  const matches = [
    {
      id: 'espn-1',
      date: '2026-06-18',
      time: '04:00',
      home: '英格兰',
      away: '克罗地亚',
    },
  ];
  const oddsRows = [
    {
      home: '英格兰',
      away: '克罗地亚',
      kickoff_label: '06-18 04:00',
      score: '4-2',
      odds: 60,
    },
  ];
  const trendRows = [
    {
      home: '英格兰',
      away: '克罗地亚',
      kickoff_label: '06-18 04:00',
      score: '4-2',
      first_odds: 75,
      latest_odds: 60,
      change_pct: -20,
      snapshots_count: 403,
    },
  ];

  assert.deepEqual(mapScoreOddsByMatch(matches, oddsRows, trendRows), {
    'espn-1': [
      {
        score: '4-2',
        odds: 60,
        trend: {
          firstOdds: 75,
          latestOdds: 60,
          changePct: -20,
          snapshotsCount: 403,
        },
      },
    ],
  });
});

test('mapScoreOddsByMatch expects imported odds to use internal Chinese team names', () => {
  const matches = [
    {
      id: 'espn-1',
      date: '2026-06-18',
      time: '01:00',
      home: '葡萄牙',
      away: '刚果民主共和国',
    },
    {
      id: 'espn-2',
      date: '2026-06-18',
      time: '10:00',
      home: '乌兹别克斯坦',
      away: '哥伦比亚',
    },
  ];
  const oddsRows = [
    {
      home: '葡萄牙',
      away: '刚果民主共和国',
      kickoff_label: '06-18 01:00',
      score: '1-0',
      odds: 6.25,
    },
    {
      home: '乌兹别克斯坦',
      away: '哥伦比亚',
      kickoff_label: '06-18 10:00',
      score: '0-1',
      odds: 11,
    },
  ];

  assert.deepEqual(mapScoreOddsByMatch(matches, oddsRows), {
    'espn-1': [{ score: '1-0', odds: 6.25 }],
    'espn-2': [{ score: '0-1', odds: 11 }],
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
    {
      home: '加拿大',
      away: '波黑',
      kickoff_label: '06-13 03:00',
      score: '胜其他',
      odds: 100,
    },
  ];
  const client = {
    from(table) {
      calls.push(['from', table]);
      const tableRows = table === 'score_odds' ? rows : [];
      return {
        select(columns) {
          calls.push(['select', columns]);
          const query = {
            order(columnName, options) {
              calls.push(['order', columnName, options]);
              return query;
            },
            range(from, to) {
              calls.push(['range', from, to]);
              return Promise.resolve({ data: tableRows, error: null });
            },
          };
          return query;
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
      { score: '胜其他', odds: 100 },
    ],
  });
  assert.deepEqual(calls, [
    ['from', 'score_odds'],
    ['select', 'home,away,kickoff_label,score,odds'],
    ['order', 'source_match_key', { ascending: true }],
    ['order', 'score', { ascending: true }],
    ['range', 0, 999],
    ['from', 'score_odds_trends'],
    ['select', 'home,away,kickoff_label,score,first_odds,latest_odds,change_pct,snapshots_count'],
    ['order', 'source_match_key', { ascending: true }],
    ['order', 'score', { ascending: true }],
    ['range', 0, 999],
  ]);
});

test('loadScoreOdds paginates beyond Supabase default row limits', async () => {
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    home: '占位',
    away: '球队',
    kickoff_label: '06-12 00:00',
    score: `${index % 6}-${index % 5}`,
    odds: 10,
  }));
  const secondPage = [
    {
      home: '西班牙',
      away: '沙特阿拉伯',
      kickoff_label: '06-22 00:00',
      score: '1-0',
      odds: 9.7,
    },
  ];
  const ranges = [];
  const client = {
    from(table) {
      return {
        select() {
          const query = {
            order() {
              return query;
            },
            range(from, to) {
              ranges.push([from, to]);
              if (table !== 'score_odds') {
                return Promise.resolve({ data: [], error: null });
              }
              return Promise.resolve({
                data: from === 0 ? firstPage : secondPage,
                error: null,
              });
            },
          };
          return query;
        },
      };
    },
  };

  const odds = await loadScoreOdds({
    client,
    matches: [{ id: 'm1', date: '2026-06-22', time: '00:00', home: '西班牙', away: '沙特阿拉伯' }],
  });

  assert.deepEqual(odds, {
    m1: [{ score: '1-0', odds: 9.7 }],
  });
  assert.equal(ranges.filter(([from, to]) => from === 0 && to === 999).length, 2);
  assert.equal(ranges.filter(([from, to]) => from === 1000 && to === 1999).length, 1);
});

test('mapAiRecommendationsByMatch converts database recommendation rows to app shape', () => {
  const rows = [
    {
      match_id: 'espn-1',
      scores: ['1-0', '2-1'],
      score_labels: ['1-0(8)', '2-1(6)'],
      strategy_id: 'favorite_narrow_win_3',
      strategy_name: '热门小胜',
      strategy_roi: -58.33,
      strategy_roi_label: '-58.33%',
      strategy_feature: '覆盖热门方一球或两球小胜。',
      router_reason: '市场更像小胜。',
      match_reason_summary: '波黑占优。',
      match_reason_detail: '2-1 和 2-0 是核心区间。',
      prediction_summary: '推荐小胜。',
      prediction_run_id: 'run-1',
      predicted_at: '2026-06-24T10:00:00.000Z',
    },
  ];

  assert.deepEqual(mapAiRecommendationsByMatch(rows), {
    'espn-1': {
      matchId: 'espn-1',
      scores: ['1-0', '2-1'],
      scoreLabels: ['1-0(8)', '2-1(6)'],
      strategyId: 'favorite_narrow_win_3',
      strategyName: '热门小胜',
      strategyRoi: -58.33,
      roiLabel: '-58.33%',
      strategyFeature: '覆盖热门方一球或两球小胜。',
      routerReason: '市场更像小胜。',
      matchReasonSummary: '波黑占优。',
      matchReasonDetail: '2-1 和 2-0 是核心区间。',
      predictionSummary: '推荐小胜。',
      predictionRunId: 'run-1',
      predictedAt: '2026-06-24T10:00:00.000Z',
    },
  });
});

test('loadAiRecommendations reads recommendation details ordered by prediction time', async () => {
  const calls = [];
  const rows = [
    {
      match_id: 'espn-1',
      scores: ['1-0'],
      score_labels: ['1-0(8)'],
      strategy_id: 's1',
      strategy_name: '热门小胜',
      strategy_roi: 12.5,
      strategy_roi_label: '+12.5%',
      strategy_feature: '特征',
      router_reason: 'router reason',
      match_reason_summary: 'summary',
      match_reason_detail: 'detail',
      prediction_summary: 'prediction',
      prediction_run_id: 'run',
      predicted_at: '2026-06-24T10:00:00.000Z',
    },
  ];
  const client = {
    from(table) {
      calls.push(['from', table]);
      assert.equal(table, 'ai_recommendations');
      return {
        select(columns) {
          calls.push(['select', columns]);
          return {
            order(column, options) {
              calls.push(['order', column, options]);
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  };

  const recommendations = await loadAiRecommendations({ client });

  assert.equal(recommendations['espn-1'].strategyName, '热门小胜');
  assert.deepEqual(calls, [
    ['from', 'ai_recommendations'],
    ['select', 'match_id,scores,score_labels,strategy_id,strategy_name,strategy_roi,strategy_roi_label,strategy_feature,router_reason,match_reason_summary,match_reason_detail,prediction_summary,prediction_run_id,predicted_at'],
    ['order', 'predicted_at', { ascending: false }],
  ]);
});

test('submitAiUserStrategy trims and inserts a pending strategy prompt', async () => {
  const calls = [];
  const client = {
    from(table) {
      calls.push(['from', table]);
      assert.equal(table, 'ai_user_strategies');
      return {
        insert(row) {
          calls.push(['insert', row]);
          return {
            select(columns) {
              calls.push(['select', columns]);
              return {
                single() {
                  calls.push(['single']);
                  return Promise.resolve({
                    data: { id: 'strategy-1', ...row },
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };

  const row = await submitAiUserStrategy({
    client,
    groupCode: 'lzscqjd',
    authorName: ' yao ',
    strategyName: ' 冷门保护 ',
    strategyPrompt: ' 先看低比分，再买弱队偷分 ',
  });

  assert.equal(row.id, 'strategy-1');
  assert.deepEqual(calls, [
    ['from', 'ai_user_strategies'],
    ['insert', {
      group_code: 'lzscqjd',
      author_name: 'yao',
      strategy_name: '冷门保护',
      strategy_prompt: '先看低比分，再买弱队偷分',
      status: 'pending',
    }],
    ['select', 'id,group_code,author_name,strategy_name,strategy_prompt,status,created_at'],
    ['single'],
  ]);
});

test('loadAiStrategyStats reads one leaderboard page with hasNext', async () => {
  const calls = [];
  const rows = [
    { strategy_id: 's1', strategy_name: '平局锚点', matches_count: 10, cost: 30, revenue: 45, profit: 15, roi: 50, updated_at: '2026-06-24T10:00:00.000Z' },
    { strategy_id: 's2', strategy_name: '低比分篮子', matches_count: 10, cost: 40, revenue: 30, profit: -10, roi: -25, updated_at: '2026-06-24T10:00:00.000Z' },
    { strategy_id: 's3', strategy_name: '热门小胜', matches_count: 10, cost: 30, revenue: 20, profit: -10, roi: -33.33, updated_at: '2026-06-24T10:00:00.000Z' },
  ];
  const client = {
    from(table) {
      calls.push(['from', table]);
      assert.equal(table, 'ai_strategy_stats');
      return {
        select(columns) {
          calls.push(['select', columns]);
          return {
            order(column, options) {
              calls.push(['order', column, options]);
              return {
                range(from, to) {
                  calls.push(['range', from, to]);
                  return Promise.resolve({ data: rows, error: null });
                },
              };
            },
          };
        },
      };
    },
  };

  const page = await loadAiStrategyStats({ client, page: 0, pageSize: 2 });

  assert.equal(page.hasNext, true);
  assert.deepEqual(page.rows.map((row) => row.strategyName), ['平局锚点', '低比分篮子']);
  assert.deepEqual(calls, [
    ['from', 'ai_strategy_stats'],
    ['select', 'strategy_id,strategy_name,matches_count,cost,revenue,profit,roi,updated_at'],
    ['order', 'roi', { ascending: false }],
    ['range', 0, 2],
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
