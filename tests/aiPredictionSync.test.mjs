import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAiPredictionEntries,
  buildAiRecommendationRows,
} from '../src/aiPredictionSync.mjs';

test('buildAiPredictionEntries converts a single prediction log into database entries', () => {
  const log = {
    match_context_file: '../match_info/2026-06-18_英格兰_vs_克罗地亚/context.json',
    prediction: {
      stakes: [
        { score: '0-0', stake: 1 },
        { score: '0-1', stake: 1 },
        { score: '1-0', stake: 1 },
        { score: '1-1', stake: 1 },
      ],
    },
  };
  const contextsByFile = {
    '../match_info/2026-06-18_英格兰_vs_克罗地亚/context.json': {
      match: { id: 'espn-760437' },
    },
  };

  assert.deepEqual(buildAiPredictionEntries({ predictionLog: log, contextsByFile }), [
    {
      matchId: 'espn-760437',
      scores: ['0-0', '0-1', '1-0', '1-1'],
    },
  ]);
});

test('buildAiPredictionEntries supports batch prediction logs', () => {
  const predictionLog = {
    predictions: [
      {
        match_context_file: '../match_info/a/context.json',
        prediction: { stakes: [{ score: '1-0', stake: 1 }] },
      },
      {
        match_context_file: '../match_info/b/context.json',
        prediction: { stakes: [{ score: '2-1', stake: 1 }, { score: '1-1', stake: 1 }] },
      },
    ],
  };
  const contextsByFile = {
    '../match_info/a/context.json': { match: { id: 'match-a' } },
    '../match_info/b/context.json': { match: { id: 'match-b' } },
  };

  assert.deepEqual(buildAiPredictionEntries({ predictionLog, contextsByFile }), [
    { matchId: 'match-a', scores: ['1-0'] },
    { matchId: 'match-b', scores: ['2-1', '1-1'] },
  ]);
});

test('buildAiRecommendationRows converts routed prediction logs into recommendation upserts', () => {
  const predictionLog = {
    generatedAt: '2026-06-24T10:00:00.000Z',
    strategy_router: 'rolling_roi_market_router_v1',
    predictions: [
      {
        matchId: 'espn-760462',
        home: '波黑',
        away: '卡塔尔',
        scores: ['1-0', '2-1'],
        route: {
          strategyId: 'favorite_narrow_win_3',
          strategyName: '热门小胜',
          strategyDescription: '覆盖热门方一球或两球小胜。',
          historicalRoiPercent: -58.33,
          roiLabel: '-58.33%',
          reason: '波黑 vs 卡塔尔：router 选择「热门小胜」。当前盘口特征：主胜最低 6.25，平局最低 8，客胜最低 15。',
        },
      },
    ],
  };
  const scoreOddsByMatch = {
    'espn-760462': [
      { score: '1-0', odds: 8 },
      { score: '2-1', odds: 6 },
    ],
  };

  assert.deepEqual(buildAiRecommendationRows({
    predictionLog,
    scoreOddsByMatch,
    predictionRunId: 'run-1',
    sourceFile: 'strategy_lab/predictions/run-1.json',
  }), [
    {
      match_id: 'espn-760462',
      scores: ['1-0', '2-1'],
      score_labels: ['1-0(8)', '2-1(6)'],
      strategy_id: 'favorite_narrow_win_3',
      strategy_name: '热门小胜',
      strategy_roi: -58.33,
      strategy_roi_label: '-58.33%',
      strategy_feature: '覆盖热门方一球或两球小胜。',
      router_reason: '波黑 vs 卡塔尔：router 选择「热门小胜」。当前盘口特征：主胜最低 6.25，平局最低 8，客胜最低 15。',
      match_reason_summary: '当前盘口特征：主胜最低 6.25，平局最低 8，客胜最低 15。',
      match_reason_detail: '波黑 vs 卡塔尔：router 选择「热门小胜」。当前盘口特征：主胜最低 6.25，平局最低 8，客胜最低 15。',
      prediction_summary: '推荐 1-0、2-1。',
      context_version: 'rolling_roi_market_router_v1',
      prediction_run_id: 'run-1',
      predicted_at: '2026-06-24T10:00:00.000Z',
      source_file: 'strategy_lab/predictions/run-1.json',
    },
  ]);
});
