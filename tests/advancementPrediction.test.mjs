import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAdvancementEntries,
  countAdvancementSelections,
  exportAdvancementPredictionsText,
  getAdvancementLockText,
  isAdvancementTieLocked,
  mergeAdvancementTiesWithMatches,
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

test('exportAdvancementPredictionsText renders settled leaderboard and pending picks', () => {
  const text = exportAdvancementPredictionsText({
    ties: [
      { matchId: 'm1', date: '2026-07-05', time: '01:00', home: '加拿大', away: '摩洛哥', homeScore: 0, awayScore: 3, status: 'post' },
      { matchId: 'm2', date: '2026-07-05', time: '05:00', home: '巴拉圭', away: '法国', homeScore: 0, awayScore: 1, status: 'post' },
      { matchId: 'm3', date: '2026-07-06', time: '04:00', home: '巴西', away: '挪威', homeScore: null, awayScore: null, status: 'pre' },
    ],
    players: [
      { id: 'p1', name: '张三' },
      { id: 'p2', name: '李四' },
    ],
    predictionsByPlayer: {
      p1: { m1: { winnerName: '摩洛哥' }, m2: { winnerName: '法国' }, m3: { winnerName: '巴西' } },
      p2: { m1: { winnerName: '加拿大' }, m2: { winnerName: '法国' } },
    },
    currentGroupUrl: 'https://example.com/?group=abc123',
  });

  assert.equal(text, [
    '8进4晋级预测结果',
    '正确答案：摩洛哥、法国、待定',
    '【排行榜】',
    '张三 2/2？',
    '李四 1/2？',
    '【预测明细】',
    '张三：摩洛哥✅、法国✅、巴西？',
    '李四：加拿大❌、法国✅、-',
    '[欢迎预测] https://example.com/?group=abc123',
  ].join('\n'));
});

test('exportAdvancementPredictionsText accepts an explicit penalty shootout winner', () => {
  const text = exportAdvancementPredictionsText({
    ties: [{
      matchId: 'm1',
      home: '瑞士',
      away: '哥伦比亚',
      homeScore: 0,
      awayScore: 0,
      winnerName: '瑞士',
      status: 'post',
    }],
    players: [{ id: 'p1', name: '张三' }],
    predictionsByPlayer: { p1: { m1: { winnerName: '瑞士' } } },
  });

  assert.match(text, /正确答案：瑞士/);
  assert.match(text, /张三 1\/1/);
});

test('mergeAdvancementTiesWithMatches fills result fields from live board matches', () => {
  assert.deepEqual(mergeAdvancementTiesWithMatches({
    ties: [{ matchId: 'm1', home: '加拿大', away: '摩洛哥', status: 'pre' }],
    matches: [{ id: 'm1', homeScore: 0, awayScore: 3, status: 'post' }],
  }), [
    { matchId: 'm1', home: '加拿大', away: '摩洛哥', homeScore: 0, awayScore: 3, status: 'post' },
  ]);
});
