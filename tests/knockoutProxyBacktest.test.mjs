import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildKnockoutProxyBacktestReport,
  enrichKnockoutProxyBacktestResult,
  filterKnockoutProxyMatches,
  getScoreMarketProfile,
  scoreKnockoutBacktestSummary,
} from '../src/knockoutProxyBacktest.mjs';

const scoreOdds = [
  { score: '1-0', odds: 5.8 },
  { score: '2-0', odds: 6.2 },
  { score: '2-1', odds: 6.6 },
  { score: '1-1', odds: 6.1 },
  { score: '0-0', odds: 10 },
  { score: '0-1', odds: 14 },
  { score: '1-2', odds: 16 },
];

test('getScoreMarketProfile summarizes correct-score market shape', () => {
  const profile = getScoreMarketProfile(scoreOdds);

  assert.equal(profile.favoriteSide, 'home');
  assert.equal(profile.homeMin, 5.8);
  assert.equal(profile.drawMin, 6.1);
  assert.equal(profile.awayMin, 14);
  assert.equal(profile.lowScoreLean, true);
  assert.equal(profile.strongFavorite, true);
});

test('filterKnockoutProxyMatches keeps completed group matches that resemble knockout conditions', () => {
  const matches = [
    {
      id: 'strong-fav',
      date: '2026-06-18',
      stage: 'Group Stage',
      homeScore: 1,
      awayScore: 0,
      status: 'post',
    },
    {
      id: 'late-pressure',
      date: '2026-06-24',
      stage: 'Group Stage',
      homeScore: 1,
      awayScore: 1,
      status: 'post',
    },
    {
      id: 'unfinished',
      date: '2026-06-24',
      stage: 'Group Stage',
      homeScore: null,
      awayScore: null,
      status: 'pre',
    },
    {
      id: 'thin-odds',
      date: '2026-06-24',
      stage: 'Group Stage',
      homeScore: 0,
      awayScore: 0,
      status: 'post',
    },
  ];
  const filtered = filterKnockoutProxyMatches({
    matches,
    scoreOddsByMatch: {
      'strong-fav': scoreOdds,
      'late-pressure': [
        { score: '0-0', odds: 7.2 },
        { score: '1-1', odds: 5.8 },
        { score: '1-0', odds: 8 },
        { score: '0-1', odds: 8.4 },
        { score: '2-1', odds: 11 },
      ],
      unfinished: scoreOdds,
      'thin-odds': [{ score: '1-1', odds: 6 }],
    },
  });

  assert.deepEqual(filtered.map((item) => item.match.id), ['strong-fav', 'late-pressure']);
  assert.match(filtered[0].reasons.join('，'), /强弱差/);
  assert.match(filtered[1].reasons.join('，'), /末轮压力|保守盘/);
});

test('scoreKnockoutBacktestSummary combines ROI, hit rate, coverage, shape, and explainability', () => {
  const score = scoreKnockoutBacktestSummary({
    roiPercent: -20,
    hitMatches: 6,
    settledMatches: 20,
    averagePicks: 3,
    explanationScore: 80,
  });

  assert.equal(score.total, 60.5);
  assert.equal(score.metrics.roi, 40);
  assert.equal(score.metrics.hitRate, 30);
  assert.equal(score.metrics.coverage, 100);
  assert.equal(score.metrics.shapeHealth, 90);
});

test('scoreKnockoutBacktestSummary caps lottery-like tail wins in proxy score', () => {
  const uncapped = scoreKnockoutBacktestSummary({
    roiPercent: 40,
    hitMatches: 16,
    settledMatches: 56,
    averagePicks: 3.2,
    explanationScore: 78,
  });
  const capped = scoreKnockoutBacktestSummary({
    roiPercent: 40,
    hitMatches: 16,
    settledMatches: 56,
    averagePicks: 3.2,
    explanationScore: 78,
    maxHitOdds: 75,
  });

  assert.equal(uncapped.metrics.roi, 100);
  assert.equal(uncapped.metrics.shapeHealth, 86);
  assert.equal(capped.metrics.roi, 80);
  assert.equal(capped.metrics.shapeHealth, 65);
  assert.ok(capped.total < uncapped.total);
});

test('enrichKnockoutProxyBacktestResult adds proxy score and metric breakdown', () => {
  const enriched = enrichKnockoutProxyBacktestResult({
    strategyId: 'stable-v1',
    rows: [
      { picks: [{ score: '1-0' }, { score: '1-1' }], hitOdds: 6 },
      { picks: [{ score: '0-0' }, { score: '0-1' }, { score: '1-1' }], hitOdds: 0 },
    ],
    roiPercent: 12,
    hitMatches: 1,
    settledMatches: 2,
  }, {
    explanationScore: 85,
    proxyMatches: 3,
    metadata: {
      family: 'draw_anchor',
      style: 'balanced',
      parameters: { maxPicks: 3 },
      explanation: '围绕平局锚点。',
    },
  });

  assert.equal(enriched.family, 'draw_anchor');
  assert.equal(enriched.style, 'balanced');
  assert.deepEqual(enriched.parameters, { maxPicks: 3 });
  assert.equal(enriched.explanation, '围绕平局锚点。');
  assert.equal(enriched.averagePicks, 2.5);
  assert.equal(enriched.maxHitOdds, 6);
  assert.equal(enriched.knockoutProxyMetrics.roi, 72);
  assert.equal(enriched.knockoutProxyMetrics.coverage, 66.7);
  assert.ok(enriched.knockoutProxyScore > 50);
});

test('buildKnockoutProxyBacktestReport renders filter reasons and scored ranking', () => {
  const report = buildKnockoutProxyBacktestReport({
    dataset: {
      contextFiles: 4,
      contextsMatchedToDb: 3,
      proxyMatches: 2,
      strategies: 1,
    },
    proxyMatches: [
      {
        match: { date: '2026-06-24', time: '03:00', home: '加拿大', away: '波黑' },
        reasons: ['保守盘', '末轮压力'],
        profile: { favoriteSide: 'draw', favoriteMin: 5.8, lowScoreLean: true },
      },
    ],
    results: [
      {
        strategyId: 'stable-v1',
        strategyName: '稳定型 v1',
        knockoutProxyScore: 72.4,
        knockoutProxyMetrics: {
          roi: 62,
          hitRate: 30,
          coverage: 100,
          shapeHealth: 90,
          explainability: 80,
        },
        roiPercent: 2,
        hitMatches: 1,
        settledMatches: 2,
        averagePicks: 2.5,
        cost: 5,
        revenue: 7,
        rows: [
          {
            date: '2026-06-24',
            time: '03:00',
            match: '加拿大 vs 波黑',
            actualScore: '1-1',
            picks: [{ score: '1-1', odds: 6 }],
            hitScore: '1-1',
            netProfit: 5,
          },
        ],
      },
    ],
  });

  assert.match(report, /Proxy matches: 2/);
  assert.match(report, /保守盘、末轮压力/);
  assert.match(report, /stable-v1/);
  assert.match(report, /收益 62 \/ 命中 30 \/ 覆盖 100/);
  assert.match(report, /命中 1-1/);
});
