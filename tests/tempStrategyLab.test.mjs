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

test('generateTempStrategyCandidates samples families evenly when capped', () => {
  const candidates = generateTempStrategyCandidates({ maxCandidates: 40 });
  const families = new Set(candidates.map((strategy) => strategy.family));

  assert.ok(families.has('poisson_ev'));
  assert.ok(families.has('trend'));
  assert.ok(families.has('draw_anchor'));
  assert.ok(families.has('market_consensus'));
  assert.ok(families.size >= 8);
});

test('generateTempStrategyCandidates includes capped draw anchor experiments', () => {
  const candidates = generateTempStrategyCandidates({ maxCandidates: 500 });
  const cappedDraw = candidates.filter((strategy) => strategy.id.includes('draw_anchor_capped'));

  assert.ok(cappedDraw.length > 0);
  assert.ok(cappedDraw.every((strategy) => strategy.family === 'draw_anchor'));
  assert.ok(cappedDraw.every((strategy) => strategy.parameters.maxPickOdds <= 35));
});

test('generateTempStrategyCandidates includes adaptive capped draw anchor experiments', () => {
  const candidates = generateTempStrategyCandidates({ maxCandidates: 700 });
  const adaptiveDraw = candidates.filter((strategy) => strategy.id.includes('draw_anchor_adaptive'));

  assert.ok(adaptiveDraw.length > 0);
  assert.ok(adaptiveDraw.every((strategy) => strategy.family === 'draw_anchor'));
  assert.ok(adaptiveDraw.every((strategy) => strategy.parameters.favoriteGap > 1));

  const homeFavorite = adaptiveDraw[0].selectPicks({
    odds: makeOdds({
      '1-1': 5,
      '0-0': 7,
      '2-2': 15,
      '1-0': 6,
      '0-1': 12,
    }),
  });
  assert.ok(homeFavorite.some((pick) => pick.score === '1-0'));
  assert.equal(homeFavorite.some((pick) => pick.score === '0-1'), false);
});

test('generateTempStrategyCandidates includes consensus plus poisson experiments', () => {
  const candidates = generateTempStrategyCandidates({ maxCandidates: 500 });
  const consensusPoisson = candidates.filter((strategy) => strategy.id.includes('consensus_poisson'));

  assert.ok(consensusPoisson.length > 0);
  assert.ok(consensusPoisson.every((strategy) => strategy.family === 'market_consensus'));
  assert.ok(consensusPoisson.every((strategy) => strategy.parameters.poissonVariant));
});

test('generateTempStrategyCandidates includes source consensus plus poisson experiments', () => {
  const candidates = generateTempStrategyCandidates({ maxCandidates: 700 });
  const sourceConsensusPoisson = candidates.filter((strategy) => strategy.id.includes('source_consensus_poisson'));

  assert.ok(sourceConsensusPoisson.length > 0);
  assert.ok(sourceConsensusPoisson.every((strategy) => strategy.family === 'market_consensus'));
  assert.ok(sourceConsensusPoisson.every((strategy) => strategy.parameters.sourceFirst === true));

  const picks = sourceConsensusPoisson[0].selectPicks({
    odds: makeOdds({
      '1-0': 6,
      '0-0': 8,
      '2-1': 9,
      '1-1': 5,
      '0-1': 11,
    }),
    context: {
      externalPredictions: [
        { source: 'Example Preview', kind: 'score', score: '2-1', outcome: 'home', totalLean: 'over' },
      ],
    },
  });

  assert.equal(picks[0].score, '2-1');
});

test('generateTempStrategyCandidates includes diverse poisson EV experiments', () => {
  const candidates = generateTempStrategyCandidates({ maxCandidates: 700 });
  const diversePoisson = candidates.filter((strategy) => strategy.id.includes('poisson_diverse'));

  assert.ok(diversePoisson.length > 0);
  assert.ok(diversePoisson.every((strategy) => strategy.family === 'poisson_ev'));
  assert.ok(diversePoisson.every((strategy) => strategy.parameters.diversity === 'outcome'));

  const picks = diversePoisson[0].selectPicks({
    odds: makeOdds({
      '0-0': 8,
      '1-1': 5,
      '2-2': 13,
      '1-0': 7,
      '0-1': 9,
      '2-1': 10,
      '1-2': 11,
    }),
    context: {
      model: {
        expectedGoals: { home: 1.2, away: 1.05 },
        drawMultiplier: 1.16,
      },
    },
  });

  assert.ok(new Set(picks.map((pick) => getScoreOutcome(pick.score))).size >= 2);
});

test('generateTempStrategyCandidates includes poisson draw-guard experiments', () => {
  const candidates = generateTempStrategyCandidates({ maxCandidates: 700 });
  const drawGuard = candidates.filter((strategy) => strategy.id.includes('poisson_drawguard'));

  assert.ok(drawGuard.length > 0);
  assert.ok(drawGuard.every((strategy) => strategy.family === 'poisson_ev'));
  assert.ok(drawGuard.every((strategy) => strategy.parameters.drawGuardScore === '1-1'));

  const picks = drawGuard.find((strategy) => strategy.parameters.drawMaxOdds === 7).selectPicks({
    odds: makeOdds({
      '0-0': 8,
      '1-1': 6.8,
      '2-2': 13,
      '1-0': 7,
      '0-1': 9,
      '2-1': 10,
      '1-2': 11,
    }),
    context: {
      model: {
        expectedGoals: { home: 1.3, away: 1.1 },
      },
    },
  });

  assert.ok(picks.some((pick) => pick.score === '1-1'));
  assert.ok(picks.length <= 3);
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

function makeOdds(oddsByScore) {
  return Object.entries(oddsByScore).map(([score, odds]) => ({ score, odds }));
}

function getScoreOutcome(score) {
  const match = String(score).match(/^(\d+)-(\d+)$/);
  if (!match) return 'unknown';
  const home = Number(match[1]);
  const away = Number(match[2]);
  if (home > away) return 'home';
  if (home === away) return 'draw';
  return 'away';
}
