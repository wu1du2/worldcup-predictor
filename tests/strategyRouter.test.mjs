import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRoutedAiPredictionEntries,
  buildRollingStrategyStats,
  routeStrategyForMatch,
} from '../src/strategyRouter.mjs';

const historicalResults = [
  {
    strategyId: 'draw_anchor_3',
    strategyName: '平局锚点',
    rows: [
      { date: '2026-06-13', time: '03:00', hitScore: '1-1', cost: 3, revenue: 5.3 },
      { date: '2026-06-14', time: '03:00', hitScore: '1-1', cost: 3, revenue: 11 },
      { date: '2026-06-26', time: '04:00', hitScore: '', cost: 3, revenue: 0 },
    ],
  },
  {
    strategyId: 'low_score_basket_4',
    strategyName: '低比分篮子',
    rows: [
      { date: '2026-06-13', time: '03:00', hitScore: '1-1', cost: 4, revenue: 5.3 },
      { date: '2026-06-14', time: '03:00', hitScore: '', cost: 4, revenue: 0 },
    ],
  },
];

const scoreOptions = [
  { score: '0-0', odds: 8 },
  { score: '0-1', odds: 12 },
  { score: '1-0', odds: 6.5 },
  { score: '1-1', odds: 5.2 },
  { score: '2-1', odds: 6.8 },
  { score: '2-2', odds: 14 },
];

test('buildRollingStrategyStats excludes matches at or after the target kickoff', () => {
  const stats = buildRollingStrategyStats({
    historicalResults,
    cutoffDate: '2026-06-24',
    cutoffTime: '01:00',
  });

  assert.equal(stats.draw_anchor_3.settledMatches, 2);
  assert.equal(stats.draw_anchor_3.cost, 6);
  assert.equal(stats.draw_anchor_3.revenue, 16.3);
  assert.equal(stats.draw_anchor_3.roiPercent, 171.67);
});

test('routeStrategyForMatch chooses an available positive-history strategy and records the ROI context', () => {
  const route = routeStrategyForMatch({
    match: { id: 'm3', date: '2026-06-24', time: '01:00', home: '葡萄牙', away: '乌兹别克斯坦' },
    scoreOptions,
    historicalResults,
  });

  assert.equal(route.strategyId, 'draw_anchor_3');
  assert.equal(route.strategyName, '平局锚点');
  assert.equal(route.roiLabel, '+171.67%');
  assert.match(route.reason, /滚动历史 ROI/);
  assert.match(route.reason, /葡萄牙 vs 乌兹别克斯坦/);
});

test('buildRoutedAiPredictionEntries falls back to low-score scores when odds are missing', () => {
  const entries = buildRoutedAiPredictionEntries({
    matches: [
      { id: 'with-odds', date: '2026-06-24', time: '01:00', home: '葡萄牙', away: '乌兹别克斯坦' },
      { id: 'no-odds', date: '2026-06-27', time: '03:00', home: '塞内加尔', away: '伊拉克' },
    ],
    scoreOddsByMatch: {
      'with-odds': scoreOptions,
    },
    historicalResults,
  });

  assert.deepEqual(entries.map((entry) => entry.matchId), ['with-odds', 'no-odds']);
  assert.deepEqual(entries[0].scores, ['1-1', '0-0', '2-2']);
  assert.deepEqual(entries[1].scores, ['0-0', '0-1', '1-0', '1-1']);
  assert.equal(entries[1].route.strategyId, 'low_score_basket_4');
  assert.match(entries[1].route.reason, /缺少可用赔率/);
});
