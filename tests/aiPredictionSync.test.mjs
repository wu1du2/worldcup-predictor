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
      router_reason: '波黑 vs 卡塔尔：router 选择「热门小胜」。',
      match_reason_summary: '推荐 1-0、2-1。',
      match_reason_detail: '本场推荐：1-0、2-1\n- 1-0：1-0(8) 按当前策略进入推荐。\n- 2-1：2-1(6) 按当前策略进入推荐。',
      prediction_summary: '推荐 1-0、2-1。',
      context_version: 'rolling_roi_market_router_v1',
      prediction_run_id: 'run-1',
      predicted_at: '2026-06-24T10:00:00.000Z',
      source_file: 'strategy_lab/predictions/run-1.json',
    },
  ]);
});

test('buildAiRecommendationRows separates router reason from per-score prediction detail', () => {
  const predictionLog = {
    generatedAt: '2026-06-26T10:00:00.000Z',
    strategy_router: 'rolling_roi_market_router_v1',
    predictions: [
      {
        matchId: 'espn-760474',
        scores: ['0-1', '0-0'],
        pickDetails: [
          { score: '0-1', odds: 29, probability: 0.049, ev: 0.421 },
          { score: '0-0', odds: 24, probability: 0.047, ev: 0.128 },
        ],
        route: {
          strategyId: 'market_poisson_ev',
          strategyName: '赛前泊松EV精选',
          strategyDescription: '用泊松进球期望和赔率寻找正EV比分。',
          historicalRoiPercent: 13.6,
          roiLabel: '+13.6%',
          reason: [
            '塞内加尔 vs 伊拉克：选「赛前泊松EV精选」。',
            '选择标准：核心候选固定保留，榜单达标策略可作为流动候选；候选策略按历史 ROI/250 + 盘口适配分排序。本策略来自流动候选。',
            '本场：滚动历史 ROI +13.6%，样本 46；适配 0.2，综合 0.25。',
            '盘口：主胜最低 7，平局最低 6，客胜最低 8。',
            '比分选择：标准是按模型概率乘赔率后的EV排序。0-1 泊松 EV 补位，赔率 8；0-0 防低节奏，赔率 6。',
          ].join(''),
        },
      },
    ],
  };

  const [row] = buildAiRecommendationRows({ predictionLog });

  assert.match(row.router_reason, /流动候选/);
  assert.match(row.router_reason, /历史\+13\.6%/);
  assert.doesNotMatch(row.router_reason, /比分选择/);
  assert.ok(row.router_reason.length < 130);
  assert.match(row.match_reason_summary, /0-1/);
  assert.match(row.match_reason_summary, /0-0/);
  assert.notEqual(row.router_reason, row.match_reason_detail);
  assert.match(row.match_reason_detail, /本场推荐：0-1、0-0/);
  assert.match(row.match_reason_detail, /- 0-1：预计概率 4\.9%，EV \+0\.42，赔率 29/);
  assert.match(row.match_reason_detail, /- 0-0：预计概率 4\.7%，EV \+0\.13，赔率 24/);
});
