import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHandicapChallengeEntries,
  calculateAllHitProbability,
  calculateMaxPayoutOdds,
  exportHandicapChallengeText,
  formatMaxPayoutOdds,
  formatHandicapChoiceLabel,
  getHandicapResultChoice,
  normalizeHandicapChallengePayload,
} from '../src/handicapChallenge.mjs';

test('buildHandicapChallengeEntries converts draft choices into save entries', () => {
  assert.deepEqual(buildHandicapChallengeEntries({
    hc1: 'win',
    hc2: 'draw',
    hc3: 'loss',
    hc4: 'home',
    hc5: '',
  }), [
    { matchId: 'hc1', choiceKey: 'win' },
    { matchId: 'hc2', choiceKey: 'draw' },
    { matchId: 'hc3', choiceKey: 'loss' },
  ]);
});

test('calculateAllHitProbability multiplies selected normalized probabilities', () => {
  const matches = [
    { matchId: 'hc1', probabilities: { win: 0.357, draw: 0.29, loss: 0.353 } },
    { matchId: 'hc2', probabilities: { win: 0.343, draw: 0.272, loss: 0.385 } },
    { matchId: 'hc3', probabilities: { win: 0.471, draw: 0.253, loss: 0.275 } },
  ];

  assert.equal(calculateAllHitProbability({ hc1: 'win', hc2: 'loss', hc3: 'draw' }, matches), 0.357 * 0.385 * 0.253);
  assert.equal(calculateAllHitProbability({ hc1: 'win' }, matches), 0.357);
});

test('calculateMaxPayoutOdds multiplies selected odds for the current parlay', () => {
  const matches = [
    { matchId: 'hc1', odds: { win: 2.48, draw: 3.05, loss: 2.51 } },
    { matchId: 'hc2', odds: { win: 2.58, draw: 3.26, loss: 2.3 } },
    { matchId: 'hc3', odds: { win: 1.88, draw: 3.5, loss: 3.22 } },
  ];

  assert.equal(calculateMaxPayoutOdds({ hc1: 'win', hc2: 'loss', hc3: 'draw' }, matches), 2.48 * 2.3 * 3.5);
  assert.equal(formatMaxPayoutOdds(16), 'X16');
  assert.equal(formatMaxPayoutOdds(2.48 * 2.3 * 3.5), 'X19.96');
  assert.equal(formatMaxPayoutOdds(0), 'X0');
});

test('formatHandicapChoiceLabel explains handicap outcomes with the market side', () => {
  assert.equal(formatHandicapChoiceLabel({ home: '法国', away: '摩洛哥', handicap: -1 }, 'win'), '让胜');
  assert.equal(formatHandicapChoiceLabel({ home: '法国', away: '摩洛哥', handicap: -1 }, 'draw'), '让平');
  assert.equal(formatHandicapChoiceLabel({ home: '法国', away: '摩洛哥', handicap: -1 }, 'loss'), '让负');
});

test('getHandicapResultChoice settles integer handicap win/draw/loss', () => {
  assert.equal(getHandicapResultChoice({ handicap: -1, homeScore: 2, awayScore: 0, status: 'post' }), 'win');
  assert.equal(getHandicapResultChoice({ handicap: -1, homeScore: 1, awayScore: 0, status: 'post' }), 'draw');
  assert.equal(getHandicapResultChoice({ handicap: -1, homeScore: 0, awayScore: 0, status: 'post' }), 'loss');
  assert.equal(getHandicapResultChoice({ handicap: 1, homeScore: 0, awayScore: 0, status: 'post' }), 'win');
  assert.equal(getHandicapResultChoice({ handicap: 1, homeScore: 0, awayScore: 1, status: 'post' }), 'draw');
  assert.equal(getHandicapResultChoice({ handicap: 1, homeScore: 0, awayScore: 2, status: 'post' }), 'loss');
  assert.equal(getHandicapResultChoice({ handicap: -1, homeScore: null, awayScore: null, status: 'pre' }), '');
});

test('normalizeHandicapChallengePayload builds normalized probabilities from odds when needed', () => {
  const normalized = normalizeHandicapChallengePayload({
    matches: [{
      matchId: 'hc1',
      date: '2026-07-10',
      time: '04:00',
      home: '法国',
      away: '摩洛哥',
      handicap: -1,
      odds: { win: 2.48, draw: 3.05, loss: 2.51 },
    }],
    predictions: [{ playerId: 'p1', matchId: 'hc1', choiceKey: 'loss' }],
  });

  assert.equal(normalized.matches[0].probabilities.win, 0.35699463260633363);
  assert.deepEqual(normalized.predictionsByPlayer, {
    p1: { hc1: { choiceKey: 'loss' } },
  });
});

test('exportHandicapChallengeText renders player sequences and max payout odds', () => {
  const text = exportHandicapChallengeText({
    matches: [
      { matchId: 'hc1', date: '2026-07-10', time: '04:00', home: '法国', away: '摩洛哥', handicap: -1, probabilities: { win: 0.357, draw: 0.29, loss: 0.353 }, odds: { win: 2.48, draw: 3.05, loss: 2.51 } },
      { matchId: 'hc2', date: '2026-07-11', time: '03:00', home: '西班牙', away: '比利时', handicap: -1, probabilities: { win: 0.343, draw: 0.272, loss: 0.385 }, odds: { win: 2.58, draw: 3.26, loss: 2.3 } },
    ],
    players: [
      { id: 'p1', name: '张三' },
      { id: 'p2', name: '李四' },
      { id: 'ai-player', name: 'AI推荐' },
    ],
    predictionsByPlayer: {
      p1: { hc1: { choiceKey: 'win' }, hc2: { choiceKey: 'loss' } },
      p2: { hc1: { choiceKey: 'draw' } },
    },
    currentGroupUrl: 'https://example.com/?group=lzscqjd',
  });

  assert.equal(text, [
    '四强之路，舍你其谁',
    '法国-1 vs 摩洛哥：让胜 2.48｜35.7%，让平 3.05｜29.0%，让负 2.51｜35.3%',
    '西班牙-1 vs 比利时：让胜 2.58｜34.3%，让平 3.26｜27.2%，让负 2.30｜38.5%',
    '【预测】',
    '张三：让胜、让负｜最高可赢X5.70',
    '李四：让平、-｜最高可赢X3.05',
    '[欢迎预测] https://example.com/?group=lzscqjd',
  ].join('\n'));
});
