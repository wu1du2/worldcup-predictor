import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPredictionContext,
  predict,
  runStrategyExperiment,
  settlePrediction,
  verifyStrategyRun,
} from '../src/strategyLab.mjs';

const strategy = `
主策略：低比分篮子 v0。
每场买 0-0、0-1、1-0、1-1，每个比分 1 注。
只使用 context 中的赛前赔率和赔率变化，不看赛果。
`;

const match = {
  id: 'm1',
  date: '2026-06-13',
  time: '03:00',
  kickoffAt: '2026-06-12T19:00:00Z',
  home: '加拿大',
  away: '波黑',
  stage: 'Group',
  status: 'post',
  homeScore: 1,
  awayScore: 1,
};

const scoreOptions = [
  { score: '0-0', odds: 12, trend: { changePct: 5 } },
  { score: '0-1', odds: 8.5, trend: { changePct: -3 } },
  { score: '1-0', odds: 7, trend: { changePct: 2 } },
  { score: '1-1', odds: 5.3, trend: { changePct: 0 } },
];

test('buildPredictionContext creates a pre-match JSON shape without leaking results', () => {
  const context = buildPredictionContext({ match, scoreOptions, generatedAt: '2026-06-12T12:00:00+08:00' });

  assert.deepEqual(context, {
    schemaVersion: 1,
    generatedAt: '2026-06-12T12:00:00+08:00',
    match: {
      id: 'm1',
      date: '2026-06-13',
      time: '03:00',
      kickoffAt: '2026-06-12T19:00:00Z',
      home: '加拿大',
      away: '波黑',
      stage: 'Group',
    },
    market: {
      scoreOptions,
    },
    publicContext: {
      notes: [],
    },
  });
  assert.equal(JSON.stringify(context).includes('homeScore'), false);
  assert.equal(JSON.stringify(context).includes('awayScore'), false);
});

test('predict applies a strategy string to one match context and records reasons', () => {
  const context = buildPredictionContext({ match, scoreOptions });
  const prediction = predict(strategy, context);

  assert.deepEqual(prediction.stakes, [
    { score: '0-0', stake: 1 },
    { score: '0-1', stake: 1 },
    { score: '1-0', stake: 1 },
    { score: '1-1', stake: 1 },
  ]);
  assert.match(prediction.reason, /低比分篮子 v0/);
  assert.match(prediction.reason, /加拿大 vs 波黑/);
});

test('settlePrediction settles score stakes separately from prediction context', () => {
  const context = buildPredictionContext({ match, scoreOptions });
  const prediction = predict(strategy, context);
  const settled = settlePrediction({ context, prediction, result: { homeScore: 1, awayScore: 1 } });

  assert.equal(settled.actualScore, '1-1');
  assert.equal(settled.cost, 4);
  assert.equal(settled.revenue, 5.3);
  assert.equal(settled.netProfit, 1.3);
  assert.equal(settled.hitScore, '1-1');
});

test('runStrategyExperiment returns predictions, settlements, and ROI for completed matches', () => {
  const context = buildPredictionContext({ match, scoreOptions });
  const result = runStrategyExperiment({
    strategy,
    contexts: [context],
    resultsByMatchId: {
      m1: { homeScore: 1, awayScore: 1 },
    },
  });

  assert.equal(result.summary.totalCost, 4);
  assert.equal(result.summary.totalRevenue, 5.3);
  assert.equal(result.summary.roiPercent, 32.5);
  assert.equal(result.predictionLogs[0].prediction.stakes.length, 4);
  assert.equal(result.settlements[0].hitScore, '1-1');
});

test('verifyStrategyRun rejects contexts that leak final scores', () => {
  const context = buildPredictionContext({ match, scoreOptions });
  const leakedContext = { ...context, match: { ...context.match, homeScore: 1 } };

  assert.throws(() => predict(strategy, leakedContext), /leaks result field/);
  const run = {
    predictionLogs: [{ matchId: 'm1', context: leakedContext, prediction: { stakes: [] } }],
    settlements: [],
    summary: {},
  };
  assert.throws(() => verifyStrategyRun(run), /leaks result field/);
});
