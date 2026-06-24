import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildContextPoissonEvSelection,
  buildMarketPoissonEvSelection,
} from '../src/poissonEvStrategy.mjs';
import { candidateStrategies, runCandidateStrategyBacktests } from '../src/strategyCandidates.mjs';
import { sportteryScoreTemplate } from '../src/scoreTemplate.mjs';

const scoreOptions = sportteryScoreTemplate.map((score) => ({
  score,
  odds: ({
    '0-0': 9,
    '1-1': 20,
    '1-0': 7,
    '0-1': 8,
    '2-0': 11,
    '0-2': 13,
    '2-1': 12,
    '1-2': 14,
    '3-0': 19,
    '0-3': 25,
  })[score] || 80,
}));

test('market Poisson EV calibrates probabilities and selects the highest expected value scores', () => {
  const selection = buildMarketPoissonEvSelection({
    odds: scoreOptions,
    context: {
      model: {
        lambdaHomeMultiplier: 0.92,
        lambdaAwayMultiplier: 0.92,
        rhoAdjustment: 0.04,
      },
    },
  });

  assert.equal(selection.strategyId, 'market_poisson_ev');
  assert.equal(selection.probabilityTable.length, sportteryScoreTemplate.length);
  assert.ok(Math.abs(sum(selection.probabilityTable.map((row) => row.probability)) - 1) < 0.000001);
  assert.equal(selection.evTable[0].score, selection.picks[0].score);
  assert.ok(Math.abs(selection.evTable[0].ev - roundMetric((selection.evTable[0].probability * selection.evTable[0].odds) - 1)) < 0.01);
  assert.ok(selection.picks.length >= 1);
  assert.ok(selection.picks.length <= 4);
  assert.ok(selection.picks.every((pick) => pick.odds <= 80));
});

test('context Poisson EV uses independent expected goals before comparing with odds', () => {
  const contextOdds = sportteryScoreTemplate.map((score) => ({
    score,
    odds: ({
      '1-0': 8,
      '2-0': 9,
      '2-1': 8.5,
      '3-0': 11,
      '0-0': 7,
      '1-1': 7,
      '0-1': 7,
    })[score] || 18,
  }));
  const selection = buildContextPoissonEvSelection({
    odds: contextOdds,
    context: {
      model: {
        expectedGoals: { home: 2.15, away: 0.65 },
        rho: -0.05,
      },
      publicContext: {
        notes: ['主队赛前压制力更强，客队偏防守。'],
      },
    },
  });

  assert.equal(selection.strategyId, 'context_poisson_ev');
  assert.ok(selection.model.lambdaHome > selection.model.lambdaAway);
  assert.ok(selection.picks.some((pick) => ['1-0', '2-0', '2-1', '3-0'].includes(pick.score)));
  assert.ok(selection.picks.every((pick) => pick.odds <= 60));
  assert.ok(selection.reason.includes('独立赛前 context'));
});

test('Poisson EV selection ignores extreme longshot odds by default', () => {
  const selection = buildMarketPoissonEvSelection({
    odds: [
      { score: '1-1', odds: 8 },
      { score: '2-2', odds: 22 },
      { score: '1-3', odds: 300 },
      { score: '2-3', odds: 250 },
      { score: '0-0', odds: 9 },
    ],
    context: { model: { expectedGoals: { home: 2, away: 2 } } },
  });

  assert.ok(selection.evTable.some((row) => row.score === '1-3'));
  assert.ok(selection.picks.every((pick) => pick.odds <= 80));
});

test('candidate strategy backtests include both Poisson EV flagship strategies', () => {
  const ids = candidateStrategies.map((strategy) => strategy.id);
  assert.ok(ids.includes('market_poisson_ev'));
  assert.ok(ids.includes('context_poisson_ev'));

  const results = runCandidateStrategyBacktests({
    matches: [
      {
        id: 'm1',
        date: '2026-06-24',
        time: '03:00',
        home: '主队',
        away: '客队',
        status: 'post',
        homeScore: 1,
        awayScore: 1,
      },
    ],
    scoreOddsByMatch: { m1: scoreOptions },
  });

  assert.ok(results.some((result) => result.strategyId === 'market_poisson_ev' && result.settledMatches === 1));
  assert.ok(results.some((result) => result.strategyId === 'context_poisson_ev' && result.settledMatches === 1));
});

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function roundMetric(value) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
