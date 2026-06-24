import test from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultQualificationGate,
  enrichBacktestResult,
  generateTempStrategyCandidates,
  selectFinalThreeStrategies,
  selectQualifiedTopStrategies,
} from '../src/tempStrategyLab.mjs';

test('generateTempStrategyCandidates creates a broad uniquely named experiment pool', () => {
  const candidates = generateTempStrategyCandidates();

  assert.ok(candidates.length >= 100);
  assert.equal(new Set(candidates.map((strategy) => strategy.id)).size, candidates.length);
  assert.ok(candidates.every((strategy) => strategy.id.startsWith('tem_')));
  assert.ok(candidates.every((strategy) => strategy.family && strategy.style && strategy.parameters));
  assert.ok(candidates.every((strategy) => typeof strategy.selectPicks === 'function'));
  assert.ok(new Set(candidates.map((strategy) => strategy.family)).size >= 8);
});

test('enrichBacktestResult computes information richness metrics and gate status', () => {
  const enriched = enrichBacktestResult({
    strategyId: 'tem_sample',
    strategyName: '样例策略',
    description: '用于测试。',
    family: 'sample',
    style: 'balanced',
    settledMatches: 3,
    cost: 9,
    revenue: 12,
    netProfit: 3,
    roiPercent: 33.33,
    hitMatches: 2,
    rows: [
      { picks: [{ score: '1-1' }, { score: '0-0' }] },
      { picks: [{ score: '1-0' }, { score: '2-1' }, { score: '1-1' }] },
      { picks: [{ score: '0-1' }, { score: '1-2' }, { score: '0-0' }, { score: '1-1' }] },
    ],
  }, {
    ...defaultQualificationGate,
    minSettledMatches: 3,
    minHitMatches: 2,
  });

  assert.equal(enriched.avgPicks, 3);
  assert.equal(enriched.minPicks, 2);
  assert.equal(enriched.maxPicks, 4);
  assert.equal(enriched.hitRatePercent, 66.67);
  assert.equal(enriched.qualified, true);
  assert.deepEqual(enriched.failedGateReasons, []);
});

test('selectQualifiedTopStrategies filters by the ROI gate and keeps family diversity', () => {
  const rows = [
    makeResult('tem_a1', 'draw', 'balanced', 80, 4),
    makeResult('tem_a2', 'draw', 'balanced', 70, 3),
    makeResult('tem_a3', 'draw', 'balanced', 60, 3),
    makeResult('tem_b1', 'poisson', 'selected', 50, 2),
    makeResult('tem_c1', 'favorite', 'attack', 40, 3),
    makeResult('tem_bad_roi', 'trend', 'attack', 2, 3),
  ];

  const selected = selectQualifiedTopStrategies(rows, {
    limit: 4,
    gate: {
      ...defaultQualificationGate,
      minSettledMatches: 35,
      minHitMatches: 4,
    },
    maxPerFamily: 2,
  });

  assert.deepEqual(selected.map((row) => row.strategyId), ['tem_a1', 'tem_a2', 'tem_b1', 'tem_c1']);
  assert.ok(selected.every((row) => row.qualified));
  assert.equal(selected.some((row) => row.strategyId === 'tem_bad_roi'), false);
});

test('selectFinalThreeStrategies chooses selected, balanced, and attack profiles', () => {
  const finalThree = selectFinalThreeStrategies([
    makeResult('tem_selected', 'poisson', 'selected', 15, 2),
    makeResult('tem_balanced', 'draw', 'balanced', 12, 3),
    makeResult('tem_attack', 'mid_value', 'attack', 10, 4),
    makeResult('tem_attack_2', 'trend', 'attack', 9, 4),
  ]);

  assert.deepEqual(finalThree.map((row) => row.finalProfile), ['精选型', '均衡型', '进攻型']);
  assert.deepEqual(finalThree.map((row) => row.strategyId), ['tem_selected', 'tem_balanced', 'tem_attack']);
});

function makeResult(strategyId, family, style, roiPercent, avgPicks) {
  const settledMatches = 40;
  const rows = Array.from({ length: settledMatches }, () => ({
    picks: Array.from({ length: avgPicks }, (_, index) => ({ score: `${strategyId}-${index}` })),
  }));
  const cost = settledMatches * avgPicks;
  const revenue = cost * (1 + (roiPercent / 100));
  return enrichBacktestResult({
    strategyId,
    strategyName: strategyId,
    description: `${strategyId} description`,
    family,
    style,
    settledMatches,
    cost,
    revenue,
    netProfit: revenue - cost,
    roiPercent,
    hitMatches: 6,
    rows,
  }, defaultQualificationGate);
}
