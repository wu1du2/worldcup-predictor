import test from 'node:test';
import assert from 'node:assert/strict';

import {
  backtestLowestOddsStrategy,
  backtestFixedScoresStrategy,
  backtestTopPositiveTrendStrategy,
  formatBacktestReport,
} from '../src/backtestStrategies.mjs';

test('backtestLowestOddsStrategy buys the two lowest-odds scores per completed match', () => {
  const result = backtestLowestOddsStrategy({
    strategyName: '每场买最低赔率2项',
    pickCount: 2,
    matches: [
      {
        id: 'm1',
        time: '03:00',
        home: '加拿大',
        away: '波黑',
        homeScore: 1,
        awayScore: 1,
        status: 'post',
      },
      {
        id: 'm2',
        time: '09:00',
        home: '美国',
        away: '巴拉圭',
        homeScore: 2,
        awayScore: 0,
        status: 'post',
      },
      {
        id: 'm3',
        time: '12:00',
        home: '德国',
        away: '日本',
        status: 'pre',
      },
    ],
    scoreOddsByMatch: {
      m1: [
        { score: '1-0', odds: 5 },
        { score: '1-1', odds: 6 },
        { score: '2-1', odds: 7 },
      ],
      m2: [
        { score: '1-0', odds: 5 },
        { score: '2-0', odds: 8 },
        { score: '2-1', odds: 7 },
      ],
      m3: [
        { score: '0-0', odds: 8 },
        { score: '1-0', odds: 6 },
      ],
    },
  });

  assert.equal(result.settledMatches, 2);
  assert.equal(result.cost, 4);
  assert.equal(result.revenue, 6);
  assert.equal(result.netProfit, 2);
  assert.equal(result.roiPercent, 50);
  assert.equal(result.hitMatches, 1);
  assert.deepEqual(result.rows.map((row) => ({
    match: row.match,
    picks: row.picks.map((pick) => pick.score),
    hitScore: row.hitScore,
    netProfit: row.netProfit,
  })), [
    {
      match: '加拿大 vs 波黑',
      picks: ['1-0', '1-1'],
      hitScore: '1-1',
      netProfit: 4,
    },
    {
      match: '美国 vs 巴拉圭',
      picks: ['1-0', '2-1'],
      hitScore: '',
      netProfit: -2,
    },
  ]);
});

test('backtestLowestOddsStrategy settles Sporttery other-score buckets', () => {
  const result = backtestLowestOddsStrategy({
    strategyName: '每场买最低赔率2项',
    pickCount: 2,
    matches: [
      {
        id: 'm1',
        time: '01:00',
        home: '德国',
        away: '库拉索',
        homeScore: 7,
        awayScore: 1,
        status: 'post',
      },
    ],
    scoreOddsByMatch: {
      m1: [
        { score: '胜其他', odds: 6 },
        { score: '4-0', odds: 7 },
      ],
    },
  });

  assert.equal(result.revenue, 6);
  assert.equal(result.rows[0].hitScore, '胜其他');
});

test('backtestTopPositiveTrendStrategy buys the two biggest positive trend scores', () => {
  const result = backtestTopPositiveTrendStrategy({
    strategyName: '每场买涨幅最大2项',
    pickCount: 2,
    matches: [
      {
        id: 'm1',
        time: '04:00',
        home: '英格兰',
        away: '克罗地亚',
        homeScore: 4,
        awayScore: 2,
        status: 'post',
      },
      {
        id: 'm2',
        time: '07:00',
        home: '法国',
        away: '德国',
        homeScore: 1,
        awayScore: 1,
        status: 'post',
      },
    ],
    scoreOddsByMatch: {
      m1: [
        { score: '4-2', odds: 60, trend: { changePct: 20 } },
        { score: '1-0', odds: 6, trend: { changePct: 10 } },
        { score: '2-1', odds: 7, trend: { changePct: -5 } },
      ],
      m2: [
        { score: '1-1', odds: 5, trend: { changePct: 0 } },
        { score: '2-1', odds: 7, trend: { changePct: 8 } },
      ],
    },
  });

  assert.equal(result.settledMatches, 1);
  assert.equal(result.cost, 2);
  assert.equal(result.revenue, 60);
  assert.equal(result.roiPercent, 2900);
  assert.deepEqual(result.rows[0].picks.map((pick) => pick.score), ['4-2', '1-0']);
});

test('backtestFixedScoresStrategy buys the same configured scores every match', () => {
  const result = backtestFixedScoresStrategy({
    strategyName: '每场买0-0、0-1、1-0、1-1',
    scores: ['0-0', '0-1', '1-0', '1-1'],
    matches: [
      {
        id: 'm1',
        time: '03:00',
        home: '加拿大',
        away: '波黑',
        homeScore: 1,
        awayScore: 1,
        status: 'post',
      },
      {
        id: 'm2',
        time: '09:00',
        home: '美国',
        away: '巴拉圭',
        homeScore: 4,
        awayScore: 1,
        status: 'post',
      },
    ],
    scoreOddsByMatch: {
      m1: [
        { score: '0-0', odds: 8 },
        { score: '0-1', odds: 9 },
        { score: '1-0', odds: 7 },
        { score: '1-1', odds: 6 },
      ],
      m2: [
        { score: '0-0', odds: 8 },
        { score: '0-1', odds: 9 },
        { score: '1-0', odds: 7 },
        { score: '1-1', odds: 6 },
      ],
    },
  });

  assert.equal(result.settledMatches, 2);
  assert.equal(result.cost, 8);
  assert.equal(result.revenue, 6);
  assert.equal(result.netProfit, -2);
  assert.equal(result.rows[0].hitScore, '1-1');
});

test('formatBacktestReport renders a compact offline report', () => {
  const result = backtestLowestOddsStrategy({
    strategyName: '每场买最低赔率2项',
    pickCount: 2,
    matches: [
      {
        id: 'm1',
        time: '03:00',
        home: '加拿大',
        away: '波黑',
        homeScore: 1,
        awayScore: 1,
        status: 'post',
      },
    ],
    scoreOddsByMatch: {
      m1: [
        { score: '1-0', odds: 5 },
        { score: '1-1', odds: 6 },
      ],
    },
  });

  assert.match(formatBacktestReport(result), /策略：每场买最低赔率2项/);
  assert.match(formatBacktestReport(result), /总成本：2/);
  assert.match(formatBacktestReport(result), /加拿大 vs 波黑 1-1\(6\) 收入 6/);
});
