import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStaticSnapshotFromBackupTables,
  getStaticAiStrategyStatsPage,
  loadStaticSnapshot,
  normalizeStaticSnapshot,
} from '../src/staticSnapshot.mjs';

test('normalizeStaticSnapshot keeps public board data and defaults missing maps', () => {
  const snapshot = normalizeStaticSnapshot({
    generatedAt: '2026-06-30T00:00:00.000Z',
    matches: [{ id: 'm1', date: '2026-07-01' }],
    scoreOddsByMatch: { m1: [{ score: '1-0', odds: 5.5 }] },
    aiRecommendationsByMatch: { m1: { scores: ['1-0'] } },
  });

  assert.deepEqual(snapshot, {
    generatedAt: '2026-06-30T00:00:00.000Z',
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
