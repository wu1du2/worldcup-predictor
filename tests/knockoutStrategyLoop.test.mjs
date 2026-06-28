import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStrategyLoopReport,
  evaluateStrategyLoopProgress,
} from '../src/knockoutStrategyLoop.mjs';

test('evaluateStrategyLoopProgress stops after five rounds below improvement threshold', () => {
  const progress = evaluateStrategyLoopProgress({
    bestScores: [77.7, 77.9, 78.05, 78.1, 78.12, 78.13],
    minImprovement: 0.5,
    patience: 5,
    maxRounds: 30,
  });

  assert.equal(progress.shouldStop, true);
  assert.equal(progress.reason, 'plateau');
  assert.equal(progress.plateauRounds, 5);
  assert.equal(progress.bestScore, 78.13);
  assert.equal(progress.bestRound, 6);
});

test('evaluateStrategyLoopProgress stops at the max round even if still improving', () => {
  const progress = evaluateStrategyLoopProgress({
    bestScores: [70, 71, 72],
    minImprovement: 0.5,
    patience: 5,
    maxRounds: 3,
  });

  assert.equal(progress.shouldStop, true);
  assert.equal(progress.reason, 'max_rounds');
  assert.equal(progress.plateauRounds, 0);
});

test('buildStrategyLoopReport writes a concise Chinese iteration summary', () => {
  const report = buildStrategyLoopReport({
    round: 6,
    progress: {
      shouldStop: true,
      reason: 'plateau',
      bestScore: 78.13,
      bestRound: 6,
      currentScore: 78.13,
      previousBestScore: 78.12,
      currentImprovement: 0.01,
      plateauRounds: 5,
    },
    topResult: {
      strategyId: 'tem_poisson_drawguard_context_v3_n2_draw7_5_cap35_p0_006',
      strategyName: '赛前泊松EV均衡 平局保护',
      knockoutProxyScore: 78.13,
      roiPercent: 26.06,
      hitMatches: 14,
      settledMatches: 56,
      averagePicks: 2.5,
    },
    artifactDir: '/tmp/run-6',
  });

  assert.match(report.message, /第6轮/);
  assert.match(report.message, /平台期/);
  assert.match(report.message, /最高分 78.13/);
  assert.match(report.errorDetail, /最佳策略/);
  assert.match(report.errorDetail, /连续 5 轮提升 < 0.5/);
});
