import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStaticGroupSnapshotsFromBackupTables,
  buildStaticSnapshotFromBackupTables,
  getStaticAiStrategyStatsPage,
  loadStaticGroupSnapshot,
  loadStaticSnapshot,
  normalizeStaticGroupSnapshot,
  normalizeStaticSnapshot,
} from '../src/staticSnapshot.mjs';

test('normalizeStaticSnapshot keeps public board data and defaults missing maps', () => {
  const snapshot = normalizeStaticSnapshot({
    generatedAt: '2026-06-30T00:00:00.000Z',
    archiveMode: true,
    matches: [{ id: 'm1', date: '2026-07-01' }],
    scoreOddsByMatch: { m1: [{ score: '1-0', odds: 5.5 }] },
    aiRecommendationsByMatch: { m1: { scores: ['1-0'] } },
  });

  assert.deepEqual(snapshot, {
    generatedAt: '2026-06-30T00:00:00.000Z',
    archiveMode: true,
    oddsWindow: null,
    matches: [{ id: 'm1', date: '2026-07-01' }],
    scoreOddsByMatch: { m1: [{ score: '1-0', odds: 5.5 }] },
    aiRecommendationsByMatch: { m1: { scores: ['1-0'] } },
    aiStrategyStats: [],
    importReports: [],
  });
});

test('loadStaticSnapshot returns null when the static file is unavailable', async () => {
  const snapshot = await loadStaticSnapshot({
    fetchImpl: async () => new Response('', { status: 404 }),
  });

  assert.equal(snapshot, null);
});

test('loadStaticGroupSnapshot returns current group players and predictions from a local cache file', async () => {
  const snapshot = await loadStaticGroupSnapshot('lzscqjd', {
    fetchImpl: async (url) => {
      assert.match(url, /^\/group-snapshots\/lzscqjd\.json\?v=\d+$/);
      return new Response(JSON.stringify({
        generatedAt: '2026-06-30T00:00:00.000Z',
        group: { id: 'g1', code: 'lzscqjd', name: 'lzscqjd' },
        players: [{ id: 'p1', name: '张三' }],
        predictions: [{ player_id: 'p1', match_id: 'm1', scores: ['1-0', 2, '2-1'] }],
        advancement: {
          ties: [{ matchId: 'qf1', home: '法国', away: '德国', status: 'post', homeScore: 2, awayScore: 1, locked: true }],
          predictions: [{ playerId: 'p1', matchId: 'qf1', winnerSide: 'home', winnerName: '法国' }],
        },
        handicapChallenge: {
          matches: [{ matchId: 'h1', home: '法国', away: '德国', handicap: -1, status: 'post' }],
          predictions: [{ playerId: 'p1', matchId: 'h1', choiceKey: 'draw' }],
        },
        championRoad: {
          teams: [{ teamKey: '法国', name: '法国' }, { teamKey: '西班牙', name: '西班牙' }],
          locked: true,
          predictions: [{ playerId: 'p1', ranking: ['法国', '西班牙'] }],
        },
      }), { status: 200 });
    },
  });

  assert.deepEqual(snapshot, {
    generatedAt: '2026-06-30T00:00:00.000Z',
    group: { id: 'g1', code: 'lzscqjd', name: 'lzscqjd' },
    players: [
      { id: 'ai-player', name: 'AI推荐', isAi: true },
      { id: 'p1', name: '张三' },
    ],
    predictions: { p1: { m1: ['1-0', '2-1'] } },
    advancement: {
      ties: [{ matchId: 'qf1', date: '', time: '', kickoffAtUtc: '', home: '法国', away: '德国', homeScore: 2, awayScore: 1, status: 'post', locked: true }],
      predictionsByPlayer: { p1: { qf1: { winnerSide: 'home', winnerName: '法国' } } },
    },
    handicapChallenge: {
      matches: [{
        matchId: 'h1', matchCode: '', issue: '', date: '', time: '', kickoffAtUtc: '', home: '法国', away: '德国',
        handicap: -1, odds: { win: 0, draw: 0, loss: 0 }, probabilities: { win: 0, draw: 0, loss: 0 },
        homeScore: null, awayScore: null, settlementHomeScore: null, settlementAwayScore: null, status: 'post', locked: false,
      }],
      predictionsByPlayer: { p1: { h1: { choiceKey: 'draw' } } },
    },
    championRoad: {
      teams: [{ teamKey: '法国', name: '法国' }, { teamKey: '西班牙', name: '西班牙' }],
      locked: true,
      lockAtUtc: '',
      predictionsByPlayer: { p1: { ranking: ['法国', '西班牙'], teamNames: ['法国', '西班牙'] } },
    },
  });
});

test('normalizeStaticGroupSnapshot rejects snapshots for another group code', () => {
  const snapshot = normalizeStaticGroupSnapshot({
    group: { id: 'g1', code: 'other', name: 'other' },
    players: [],
    predictions: [],
  }, { groupCode: 'lzscqjd' });

  assert.equal(snapshot, null);
});

test('buildStaticGroupSnapshotsFromBackupTables writes one cache payload per group code', () => {
  const snapshots = buildStaticGroupSnapshotsFromBackupTables({
    now: new Date('2026-06-30T00:00:00.000Z'),
    tables: {
      groups: [
        { id: 'g1', code: 'a1b2c3', name: '群A', created_at: '2026-06-12T00:00:00Z' },
        { id: 'g2', code: 'z9y8x7', name: '群B', created_at: '2026-06-13T00:00:00Z' },
      ],
      players: [
        { id: 'p1', group_id: 'g1', name: '张三', created_at: '2026-06-12T01:00:00Z' },
        { id: 'p2', group_id: 'g2', name: '李四', created_at: '2026-06-13T01:00:00Z' },
      ],
      predictions: [
        { group_id: 'g1', player_id: 'p1', match_id: 'm1', scores: '["1-0"]' },
        { group_id: 'g2', player_id: 'p2', match_id: 'm1', scores: ['2-0'] },
      ],
      matches: [
        { match_code: 'r16-1', match_date_cn: '2026-07-01', time_cn: '01:00', kickoff_at_utc: '2026-06-30T17:00:00Z', home_cn: '法国', away_cn: '德国', home_score: 1, away_score: 0, status: 'post', stage: 'Round of 16', active: 1 },
        { match_code: 'qf1', match_date_cn: '2026-07-05', time_cn: '01:00', kickoff_at_utc: '2026-07-04T17:00:00Z', home_cn: '法国', away_cn: '德国', home_score: 2, away_score: 1, status: 'post', stage: 'Quarterfinals', active: 1 },
        { match_code: 'sf1', match_date_cn: '2026-07-15', time_cn: '03:00', kickoff_at_utc: '2026-07-14T19:00:00Z', home_cn: '法国', away_cn: '西班牙', status: 'post', stage: 'Semifinals', active: 1 },
        { match_code: 'sf2', match_date_cn: '2026-07-16', time_cn: '03:00', kickoff_at_utc: '2026-07-15T19:00:00Z', home_cn: '阿根廷', away_cn: '英格兰', status: 'post', stage: 'Semifinals', active: 1 },
      ],
      advancement_predictions: [
        { group_id: 'g1', player_id: 'p1', match_id: 'r16-1', winner_side: 'home', winner_name: '法国' },
      ],
      handicap_challenge_matches: [
        { match_id: 'h1', match_code: 'qf1', date_cn: '2026-07-05', time_cn: '01:00', kickoff_at_utc: '2026-07-04T17:00:00Z', home_cn: '法国', away_cn: '德国', handicap: -1, odds_win: 3, odds_draw: 3.2, odds_loss: 2, probability_win: 0.3, probability_draw: 0.28, probability_loss: 0.42, active: 1 },
      ],
      handicap_challenge_predictions: [
        { group_id: 'g1', player_id: 'p1', match_id: 'h1', choice_key: 'draw' },
      ],
      champion_road_predictions: [
        { group_id: 'g1', player_id: 'p1', ranking: '["法国","西班牙","阿根廷","英格兰"]' },
      ],
    },
  });

  assert.deepEqual(Object.keys(snapshots).sort(), ['a1b2c3', 'z9y8x7']);
  assert.equal(snapshots.a1b2c3.group.id, 'g1');
  assert.deepEqual(snapshots.a1b2c3.players, [{ id: 'p1', name: '张三' }]);
  assert.deepEqual(snapshots.a1b2c3.predictions, [
    { player_id: 'p1', match_id: 'm1', scores: ['1-0'] },
  ]);
  assert.deepEqual(snapshots.a1b2c3.advancement.predictions, [
    { playerId: 'p1', matchId: 'r16-1', winnerSide: 'home', winnerName: '法国' },
  ]);
  assert.deepEqual(snapshots.a1b2c3.advancement.ties.map((tie) => tie.matchId), ['r16-1']);
  assert.equal(snapshots.a1b2c3.handicapChallenge.matches[0].homeScore, 2);
  assert.deepEqual(snapshots.a1b2c3.championRoad.predictions, [
    { playerId: 'p1', ranking: ['法国', '西班牙', '阿根廷', '英格兰'] },
  ]);
  assert.equal(snapshots.z9y8x7.group.id, 'g2');
  assert.deepEqual(snapshots.z9y8x7.predictions, [
    { player_id: 'p2', match_id: 'm1', scores: ['2-0'] },
  ]);
});

test('buildStaticSnapshotFromBackupTables converts backup rows into public static app data', () => {
  const snapshot = buildStaticSnapshotFromBackupTables({
    now: new Date('2026-06-30T00:00:00.000Z'),
    tables: {
      matches: [{
        id: 'db-row-1',
        match_code: 'espn-1',
        match_date_cn: '2026-07-01',
        time_cn: '03:00',
        home: 'Brazil',
        away: 'Japan',
        home_cn: '巴西',
        away_cn: '日本',
        home_score: 2,
        away_score: 1,
        status: 'post',
        active: true,
      }],
      score_odds: [{
        home: '巴西',
        away: '日本',
        kickoff_label: '07-01 03:00',
        score: '2-1',
        odds: 6.5,
      }],
      score_odds_trends: [{
        home: '巴西',
        away: '日本',
        kickoff_label: '07-01 03:00',
        score: '2-1',
        first_odds: 7,
        latest_odds: 6.5,
        change_pct: -7.14,
        snapshots_count: 3,
      }],
      ai_recommendations: [{
        match_id: 'espn-1',
        scores: ['2-1'],
        score_labels: ['2-1(6.5)'],
        strategy_id: 's1',
        strategy_name: '稳定型',
        strategy_roi: 12.5,
        strategy_roi_label: '+12.5%',
        router_reason: '盘口匹配。',
        match_reason_summary: '推荐主胜小比分。',
        match_reason_detail: '预计概率 16%，EV 0.04。',
        prediction_summary: '推荐 2-1。',
        predicted_at: '2026-06-30T00:00:00.000Z',
      }],
      ai_strategy_stats: [{
        strategy_id: 's1',
        strategy_name: '稳定型',
        matches_count: 12,
        cost: 24,
        revenue: 36,
        profit: 12,
        roi: 50,
        updated_at: '2026-06-30T00:00:00.000Z',
      }],
      import_reports: [{
        id: 'r1',
        job_name: 'matches',
        status: 'success',
        started_at: '2026-06-30T00:00:00.000Z',
        finished_at: '2026-06-30T00:01:00.000Z',
        rows_written: 1,
        items_seen: 1,
        message: 'ok',
        error_detail: '',
        run_url: '',
        created_at: '2026-06-30T00:01:00.000Z',
      }],
    },
  });

  assert.equal(snapshot.matches[0].id, 'espn-1');
  assert.equal(snapshot.matches[0].home, '巴西');
  assert.equal(snapshot.matches[0].homeScore, 2);
  assert.deepEqual(snapshot.scoreOddsByMatch['espn-1'][0], {
    score: '2-1',
    odds: 6.5,
    trend: {
      firstOdds: 7,
      latestOdds: 6.5,
      changePct: -7.14,
      snapshotsCount: 3,
    },
  });
  assert.deepEqual(snapshot.aiRecommendationsByMatch['espn-1'].scores, ['2-1']);
  assert.equal(snapshot.aiStrategyStats[0].strategyName, '稳定型');
  assert.equal(snapshot.importReports[0].jobName, 'matches');
});

test('getStaticAiStrategyStatsPage paginates static leaderboard rows', () => {
  const result = getStaticAiStrategyStatsPage([
    { strategyId: 'a', roi: 10 },
    { strategyId: 'b', roi: 5 },
    { strategyId: 'c', roi: 1 },
  ], { page: 1, pageSize: 2 });

  assert.deepEqual(result, {
    rows: [{ strategyId: 'c', roi: 1 }],
    page: 1,
    pageSize: 2,
    hasNext: false,
  });
});

test('getStaticAiStrategyStatsPage prioritizes the three flagship strategies before ROI sorting', () => {
  const result = getStaticAiStrategyStatsPage([
    { strategyId: 'other-hot', strategyName: '短期爆发', roi: 300 },
    { strategyId: 'c52e5c84-d2f9-46e4-87d7-ea600bccb488', strategyName: '价值型', roi: 27.73 },
    { strategyId: 'other-mid', strategyName: '普通策略', roi: 80 },
    { strategyId: 'tem_source_consensus_poisson_context_v1_s2_c3_n3_cap6', strategyName: '共识型', roi: -5 },
    { strategyId: 'tem_draw_anchor_lean_homeaway2_draw6_cap22', strategyName: '稳定型', roi: -12.34 },
  ], { page: 0, pageSize: 4 });

  assert.deepEqual(result.rows.map((row) => row.strategyName), ['稳定型', '价值型', '共识型', '短期爆发']);
  assert.equal(result.hasNext, true);
});
