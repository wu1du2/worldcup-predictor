import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAiStrategyHitDetailsIndex,
  formatHitDetailRoi,
} from '../src/aiStrategyHitDetails.mjs';
import { deterministicUuid } from '../src/stableUuid.mjs';

test('buildAiStrategyHitDetailsIndex lists winning matches by per-match ROI', () => {
  const index = buildAiStrategyHitDetailsIndex([
    {
      strategyId: 'stable-v1',
      strategyName: '稳定型',
      roiPercent: 18.5,
      cost: 6,
      revenue: 7.1,
      netProfit: 1.1,
      hitMatches: 2,
      settledMatches: 3,
      rows: [
        {
          matchId: 'm01',
          date: '2026-06-13',
          time: '03:00',
          match: '加拿大 vs 波黑',
          actualScore: '1-1',
          hitScore: '1-1',
          hitOdds: 5.3,
          cost: 3,
          revenue: 5.3,
          netProfit: 2.3,
        },
        {
          matchId: 'm02',
          date: '2026-06-14',
          time: '06:00',
          match: '巴西 vs 摩洛哥',
          actualScore: '2-0',
          hitScore: '',
          hitOdds: 0,
          cost: 2,
          revenue: 0,
          netProfit: -2,
        },
        {
          matchId: 'm03',
          date: '2026-06-15',
          time: '09:00',
          match: '荷兰 vs 日本',
          actualScore: '2-2',
          hitScore: '2-2',
          hitOdds: 18,
          cost: 4,
          revenue: 18,
          netProfit: 14,
        },
      ],
    },
  ]);

  const detailByRawId = index['stable-v1'];
  const detailBySystemId = index[deterministicUuid('system:stable-v1')];

  assert.equal(detailByRawId.strategyName, '稳定型');
  assert.equal(detailBySystemId.strategyId, 'stable-v1');
  assert.equal(detailBySystemId.systemStrategyId, deterministicUuid('system:stable-v1'));
  assert.deepEqual(detailByRawId.hits.map((row) => row.match), [
    '荷兰 vs 日本',
    '加拿大 vs 波黑',
  ]);
  assert.equal(detailByRawId.hits[0].matchRoi, 350);
  assert.equal(detailByRawId.hits[1].matchRoi, 76.67);
});

test('formatHitDetailRoi renders compact signed percentages', () => {
  assert.equal(formatHitDetailRoi(76.67), '+76.7%');
  assert.equal(formatHitDetailRoi(-12), '-12%');
});
