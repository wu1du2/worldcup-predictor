import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAiChampionRoadRanking,
  buildDefaultChampionRanking,
  exportChampionRoadText,
  isCompleteChampionRanking,
  moveChampionRankingItem,
  normalizeChampionRoadPayload,
} from '../src/championRoad.mjs';

const teams = [
  { teamKey: '法国', name: '法国' },
  { teamKey: '西班牙', name: '西班牙' },
  { teamKey: '英格兰', name: '英格兰' },
  { teamKey: '阿根廷', name: '阿根廷' },
];

test('normalizeChampionRoadPayload maps ranking rows by player', () => {
  assert.deepEqual(normalizeChampionRoadPayload({
    teams,
    locked: true,
    predictions: [
      { playerId: 'p1', ranking: ['阿根廷', '法国', '西班牙', '英格兰'] },
      { playerId: 'p2', ranking: ['不存在', '法国', '法国'] },
    ],
  }), {
    teams,
    locked: true,
    lockAtUtc: '',
    predictionsByPlayer: {
      p1: {
        ranking: ['阿根廷', '法国', '西班牙', '英格兰'],
        teamNames: ['阿根廷', '法国', '西班牙', '英格兰'],
      },
      p2: {
        ranking: ['法国'],
        teamNames: ['法国'],
      },
    },
  });
});

test('champion ranking helpers keep four unique teams', () => {
  assert.deepEqual(buildDefaultChampionRanking(teams), ['法国', '西班牙', '英格兰', '阿根廷']);
  assert.deepEqual(buildAiChampionRoadRanking(teams), ['法国', '英格兰', '西班牙', '阿根廷']);
  assert.equal(isCompleteChampionRanking(['法国', '西班牙', '英格兰', '阿根廷'], teams), true);
  assert.equal(isCompleteChampionRanking(['法国', '西班牙', '英格兰'], teams), false);
  assert.deepEqual(moveChampionRankingItem(['法国', '西班牙', '英格兰', '阿根廷'], 3, 0), ['阿根廷', '法国', '西班牙', '英格兰']);
});

test('exportChampionRoadText renders player ranking sequences', () => {
  const text = exportChampionRoadText({
    teams,
    players: [
      { id: 'p1', name: '张三' },
      { id: 'p2', name: '李四' },
      { id: 'ai', name: 'AI推荐' },
    ],
    predictionsByPlayer: {
      p1: { ranking: ['阿根廷', '法国', '西班牙', '英格兰'] },
      p2: { ranking: ['法国', '英格兰', '阿根廷', '西班牙'] },
      ai: { ranking: ['法国', '西班牙', '英格兰', '阿根廷'] },
    },
    currentGroupUrl: 'https://example.com/?group=lzscqjd',
  });

  assert.equal(text, [
    '冠军之路',
    '球队：法国、西班牙、英格兰、阿根廷',
    '【AI推荐】',
    'AI推荐：1.法国 2.英格兰 3.西班牙 4.阿根廷',
    '【大家预测】',
    '张三：1.阿根廷 2.法国 3.西班牙 4.英格兰',
    '李四：1.法国 2.英格兰 3.阿根廷 4.西班牙',
    '[欢迎预测] https://example.com/?group=lzscqjd',
  ].join('\n'));
});

test('exportChampionRoadText includes AI champion recommendation even without stored AI row', () => {
  const text = exportChampionRoadText({
    teams,
    players: [{ id: 'p1', name: '张三' }],
    predictionsByPlayer: {},
  });

  assert.equal(text, [
    '冠军之路',
    '球队：法国、西班牙、英格兰、阿根廷',
    '【AI推荐】',
    'AI推荐：1.法国 2.英格兰 3.西班牙 4.阿根廷',
    '【大家预测】',
    '暂无预测',
  ].join('\n'));
});
