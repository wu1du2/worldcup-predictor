import test from 'node:test';
import assert from 'node:assert/strict';

import {
  candidateStrategies,
  formatCandidateStrategySummary,
  runCandidateStrategyBacktests,
} from '../src/strategyCandidates.mjs';

const sampleMatches = [
  {
    id: 'm1',
    date: '2026-06-18',
    time: '04:00',
    home: '英格兰',
    away: '克罗地亚',
    homeScore: 2,
    awayScore: 1,
    status: 'post',
  },
  {
    id: 'm2',
    date: '2026-06-19',
    time: '07:00',
    home: '墨西哥',
    away: '韩国',
    homeScore: 1,
    awayScore: 1,
    status: 'post',
  },
];

const sampleOdds = {
  m1: [
    { score: '1-0', odds: 6.3, trend: { changePct: 14.5 } },
    { score: '2-0', odds: 8.5, trend: { changePct: -2 } },
    { score: '2-1', odds: 5.6, trend: { changePct: -20 } },
    { score: '1-1', odds: 5.8, trend: { changePct: -3.3 } },
    { score: '0-1', odds: 13, trend: { changePct: 18.1 } },
    { score: '0-0', odds: 10, trend: { changePct: 5.2 } },
    { score: '胜其他', odds: 100, trend: { changePct: 0 } },
  ],
  m2: [
    { score: '0-0', odds: 7.5, trend: { changePct: -8 } },
    { score: '1-0', odds: 6.5, trend: { changePct: -4 } },
    { score: '1-1', odds: 5.1, trend: { changePct: 2 } },
    { score: '2-1', odds: 8, trend: { changePct: 12 } },
    { score: '0-1', odds: 8.2, trend: { changePct: 10 } },
    { score: '1-2', odds: 12, trend: { changePct: 20 } },
    { score: '平其他', odds: 500, trend: { changePct: 0 } },
  ],
};

test('candidate strategy set contains eighteen named offline strategies', () => {
  assert.equal(candidateStrategies.length, 18);
  assert.equal(new Set(candidateStrategies.map((strategy) => strategy.id)).size, 18);
  assert.deepEqual(candidateStrategies.map((strategy) => strategy.id), [
    'low_score_basket_4',
    'lowest_odds_2',
    'lowest_odds_3',
    'market_consensus_4',
    'favorite_narrow_win_3',
    'draw_anchor_3',
    'underdog_cover_3',
    'trend_risers_2',
    'trend_fallers_2',
    'balanced_outcomes_3',
    'low_score_dutch_3',
    'favorite_six_cover',
    'favorite_draw_saver_4',
    'mid_odds_value_3',
    'market_poisson_ev',
    'context_poisson_ev',
    'context_poisson_ev_v2',
    'context_poisson_ev_v3',
  ]);
});

test('runCandidateStrategyBacktests settles every candidate with consistent ROI accounting', () => {
  const results = runCandidateStrategyBacktests({
    matches: sampleMatches,
    scoreOddsByMatch: sampleOdds,
  });

  assert.equal(results.length, 18);

  const lowScore = results.find((result) => result.strategyId === 'low_score_basket_4');
  assert.equal(lowScore.cost, 8);
  assert.equal(lowScore.revenue, 5.1);
  assert.equal(lowScore.hitMatches, 1);
  assert.deepEqual(lowScore.rows[0].picks.map((pick) => pick.score), ['0-0', '0-1', '1-0', '1-1']);

  const trendRisers = results.find((result) => result.strategyId === 'trend_risers_2');
  assert.deepEqual(trendRisers.rows[0].picks.map((pick) => pick.score), ['0-1', '1-0']);
  assert.deepEqual(trendRisers.rows[1].picks.map((pick) => pick.score), ['1-2', '2-1']);

  const lowDutch = results.find((result) => result.strategyId === 'low_score_dutch_3');
  assert.deepEqual(lowDutch.rows[0].picks.map((pick) => pick.score), ['0-0', '1-0', '0-1']);

  const favoriteCover = results.find((result) => result.strategyId === 'favorite_six_cover');
  assert.deepEqual(favoriteCover.rows[0].picks.map((pick) => pick.score), ['1-0', '2-0', '2-1']);

  const marketPoisson = results.find((result) => result.strategyId === 'market_poisson_ev');
  assert.equal(marketPoisson.settledMatches, 2);
  assert.ok(marketPoisson.rows[0].picks[0].score);
  assert.ok(Number.isFinite(marketPoisson.rows[0].picks[0].ev));

  const contextPoisson = results.find((result) => result.strategyId === 'context_poisson_ev');
  assert.equal(contextPoisson.settledMatches, 2);
  assert.ok(contextPoisson.rows[0].picks[0].score);
  assert.ok(Number.isFinite(contextPoisson.rows[0].picks[0].probability));

  const contextPoissonV2 = results.find((result) => result.strategyId === 'context_poisson_ev_v2');
  assert.equal(contextPoissonV2.settledMatches, 2);
  assert.ok(contextPoissonV2.rows[0].picks.length <= 2);
  assert.ok(Number.isFinite(contextPoissonV2.rows[0].picks[0].ev));

  const contextPoissonV3 = results.find((result) => result.strategyId === 'context_poisson_ev_v3');
  assert.equal(contextPoissonV3.settledMatches, 2);
  assert.ok(contextPoissonV3.rows[0].picks.length >= 2);
  assert.ok(Number.isFinite(contextPoissonV3.rows[0].picks[0].probability));

  const summary = formatCandidateStrategySummary(results);
  assert.match(summary, /候选策略回测/);
  assert.match(summary, /low_score_basket_4/);
  assert.match(summary, /trend_risers_2/);
  assert.match(summary, /market_poisson_ev/);
  assert.match(summary, /context_poisson_ev_v2/);
  assert.match(summary, /context_poisson_ev_v3/);
});
