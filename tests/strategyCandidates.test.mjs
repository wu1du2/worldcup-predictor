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

test('candidate strategy set contains final3 production candidates and offline strategies', () => {
  assert.equal(candidateStrategies.length, 25);
  assert.equal(new Set(candidateStrategies.map((strategy) => strategy.id)).size, 25);
  assert.deepEqual(candidateStrategies.map((strategy) => strategy.id), [
    'low_score_basket_4',
    'lowest_odds_2',
    'lowest_odds_3',
    'market_consensus_4',
    'tem_consensus_n3_cap7',
    'tem_consensus_poisson_context_v1_c1_n4_cap7',
    'market_consensus_sources',
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
    'tem_poisson_drawguard_context_v3_n2_draw7_cap35_p0_006',
    'context_poisson_ev_v3',
    'tem_hybrid_draw_poisson_v2_d1_n2',
    'tem_draw_anchor_3_max5_5',
    'tem_draw_anchor_capped_1_draw5_5_cap35',
  ]);
  const consensusV3 = candidateStrategies.find((strategy) => strategy.id === 'tem_consensus_n3_cap7');
  assert.equal(consensusV3.family, 'market_consensus');
  assert.equal(consensusV3.style, 'balanced');
  assert.deepEqual(consensusV3.parameters, { maxPicks: 3, maxOdds: 7 });
  const valueV5 = candidateStrategies.find((strategy) => strategy.id === 'tem_poisson_drawguard_context_v3_n2_draw7_cap35_p0_006');
  assert.equal(valueV5.family, 'poisson_ev');
  assert.equal(valueV5.style, 'selected');
  assert.equal(valueV5.parameters.basePicks, 2);
  assert.equal(valueV5.parameters.diversity, 'outcome');
  assert.equal(valueV5.parameters.drawGuardScore, '1-1');
  const consensusV4 = candidateStrategies.find((strategy) => strategy.id === 'tem_consensus_poisson_context_v1_c1_n4_cap7');
  assert.equal(consensusV4.family, 'market_consensus');
  assert.equal(consensusV4.style, 'attack');
  assert.equal(consensusV4.parameters.poissonVariant, 'context_v1');
  const drawV4 = candidateStrategies.find((strategy) => strategy.id === 'tem_draw_anchor_capped_1_draw5_5_cap35');
  assert.equal(drawV4.family, 'draw_anchor');
  assert.equal(drawV4.style, 'balanced');
  assert.equal(drawV4.parameters.maxPickOdds, 35);
});

test('runCandidateStrategyBacktests settles every candidate with consistent ROI accounting', () => {
  const results = runCandidateStrategyBacktests({
    matches: sampleMatches,
    scoreOddsByMatch: sampleOdds,
  });

  assert.equal(results.length, 25);

  const lowScore = results.find((result) => result.strategyId === 'low_score_basket_4');
  assert.equal(lowScore.cost, 8);
  assert.equal(lowScore.revenue, 5.1);
  assert.equal(lowScore.hitMatches, 1);
  assert.deepEqual(lowScore.rows[0].picks.map((pick) => pick.score), ['0-0', '0-1', '1-0', '1-1']);

  const trendRisers = results.find((result) => result.strategyId === 'trend_risers_2');
  assert.deepEqual(trendRisers.rows[0].picks.map((pick) => pick.score), ['0-1', '1-0']);
  assert.deepEqual(trendRisers.rows[1].picks.map((pick) => pick.score), ['1-2', '2-1']);

  const consensusV3 = results.find((result) => result.strategyId === 'tem_consensus_n3_cap7');
  assert.deepEqual(consensusV3.rows[0].picks.map((pick) => pick.score), ['2-1', '1-1', '1-0']);
  assert.deepEqual(consensusV3.rows[1].picks.map((pick) => pick.score), ['1-1', '1-0']);

  const consensusV4 = results.find((result) => result.strategyId === 'tem_consensus_poisson_context_v1_c1_n4_cap7');
  assert.equal(consensusV4.settledMatches, 2);
  assert.ok(consensusV4.rows[0].picks.length <= 4);
  assert.equal(consensusV4.rows[0].picks[0].score, '2-1');

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

  const valueV5 = results.find((result) => result.strategyId === 'tem_poisson_drawguard_context_v3_n2_draw7_cap35_p0_006');
  assert.equal(valueV5.settledMatches, 2);
  assert.ok(valueV5.rows[0].picks.length <= 3);
  assert.ok(valueV5.rows[0].picks.some((pick) => pick.score === '1-1'));
  assert.ok(Number.isFinite(valueV5.rows[0].picks[0].ev));

  const contextPoissonV3 = results.find((result) => result.strategyId === 'context_poisson_ev_v3');
  assert.equal(contextPoissonV3.settledMatches, 2);
  assert.ok(contextPoissonV3.rows[0].picks.length >= 2);
  assert.ok(Number.isFinite(contextPoissonV3.rows[0].picks[0].probability));

  const hybridFinal = results.find((result) => result.strategyId === 'tem_hybrid_draw_poisson_v2_d1_n2');
  assert.equal(hybridFinal.settledMatches, 2);
  assert.ok(hybridFinal.rows[0].picks.length <= 2);
  assert.equal(hybridFinal.rows[0].picks[0].score, '1-1');

  const drawFinal = results.find((result) => result.strategyId === 'tem_draw_anchor_3_max5_5');
  assert.equal(drawFinal.settledMatches, 2);
  assert.deepEqual(drawFinal.rows[0].picks.map((pick) => pick.score), ['1-1', '0-0']);

  const cappedDraw = results.find((result) => result.strategyId === 'tem_draw_anchor_capped_1_draw5_5_cap35');
  assert.equal(cappedDraw.settledMatches, 2);
  assert.deepEqual(cappedDraw.rows[0].picks.map((pick) => pick.score), ['1-1', '0-0']);
  assert.ok(cappedDraw.rows.every((row) => row.picks.every((pick) => pick.odds <= 35)));

  const summary = formatCandidateStrategySummary(results);
  assert.match(summary, /候选策略回测/);
  assert.match(summary, /low_score_basket_4/);
  assert.match(summary, /trend_risers_2/);
  assert.match(summary, /tem_consensus_n3_cap7/);
  assert.match(summary, /tem_consensus_poisson_context_v1_c1_n4_cap7/);
  assert.match(summary, /market_poisson_ev/);
  assert.match(summary, /context_poisson_ev_v2/);
  assert.match(summary, /tem_poisson_drawguard_context_v3_n2_draw7_cap35_p0_006/);
  assert.match(summary, /context_poisson_ev_v3/);
  assert.match(summary, /tem_hybrid_draw_poisson_v2_d1_n2/);
  assert.match(summary, /tem_draw_anchor_3_max5_5/);
  assert.match(summary, /tem_draw_anchor_capped_1_draw5_5_cap35/);
});
