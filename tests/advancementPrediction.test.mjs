import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAdvancementEntries,
  countAdvancementSelections,
  exportAdvancementPredictionsText,
  getAdvancementLockText,
  isAdvancementTieLocked,
} from '../src/advancementPrediction.mjs';

test('buildAdvancementEntries converts draft winner sides into save payload entries', () => {
  assert.deepEqual(buildAdvancementEntries({
    m1: 'home',
    m2: 'away',
    m3: 'draw',
    m4: '',
  }), [
    { matchId: 'm1', winnerSide: 'home' },
    { matchId: 'm2', winnerSide: 'away' },
  ]);
});

test('countAdvancementSelections counts selected ties only', () => {
  assert.equal(countAdvancementSelections({ m1: 'home', m2: 'away', m3: '' }, [
    { matchId: 'm1' },
    { matchId: 'm2' },
    { matchId: 'm4' },
  ]), 2);
});

test('isAdvancementTieLocked locks exactly fifteen minutes before kickoff', () => {
  const tie = { kickoffAtUtc: '2026-07-04T17:00:00.000Z' };

  assert.equal(isAdvancementTieLocked(tie, new Date('2026-07-04T16:44:59.000Z')), false);
  assert.equal(isAdvancementTieLocked(tie, new Date('2026-07-04T16:45:00.000Z')), true);
});

test('getAdvancementLockText describes locked and open ties', () => {
  assert.equal(getAdvancementLockText({ locked: true }), '已锁定');
  assert.equal(getAdvancementLockText({ locked: false }), '可修改');
});

test('exportAdvancementPredictionsText renders player prediction sequences', () => {
  const text = exportAdvancementPredictionsText({
    ties: [
      { matchId: 'm1', date: '2026-07-05', time: '01:00', home: '加拿大', away: '摩洛哥' },
      { matchId: 'm2', date: '2026-07-05', time: '05:00', home: '巴拉圭', away: '法国' },
    ],
    players: [
      { id: 'p1', name: '张三' },
      { id: 'p2', name: '李四' },
    ],
    predictionsByPlayer: {
      p1: { m1: { winnerName: '加拿大' }, m2: { winnerName: '法国' } },
      p2: { m1: { winnerName: '摩洛哥' } },
    },
    currentGroupUrl: 'https://example.com/?group=abc123',
  });

  assert.equal(text, [
    '16进8晋级预测',
    '顺序：加拿大vs摩洛哥、巴拉圭vs法国',
    '张三：加拿大、法国',
    '李四：摩洛哥、-',
    '[欢迎预测] https://example.com/?group=abc123',
  ].join('\n'));
});
