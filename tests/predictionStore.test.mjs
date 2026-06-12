import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addCustomPlayer,
  createInitialState,
  exportPredictionsText,
  formatScoreOptionLabel,
  getCopyStatusText,
  submitPrediction,
  toggleScorePick,
} from '../src/predictionStore.mjs';

const players = [
  { id: 'alice', name: '阿哲' },
  { id: 'bob', name: '北北' },
];

const matches = [
  {
    id: 'm1',
    date: '2026-06-13',
    time: '03:00',
    home: '德国',
    away: '日本',
  },
  {
    id: 'm2',
    date: '2026-06-13',
    time: '21:00',
    home: '西班牙',
    away: '巴西',
  },
];

test('toggleScorePick adds and removes correct-score picks without duplicates', () => {
  assert.deepEqual(toggleScorePick([], '1-0'), ['1-0']);
  assert.deepEqual(toggleScorePick(['1-0'], '2-1'), ['1-0', '2-1']);
  assert.deepEqual(toggleScorePick(['1-0', '2-1'], '1-0'), ['2-1']);
});

test('submitPrediction stores one player match entry and later submissions overwrite it', () => {
  let state = createInitialState();

  state = submitPrediction(state, {
    playerId: 'alice',
    matchId: 'm1',
    scores: ['1-0', '2-1'],
  });
  state = submitPrediction(state, {
    playerId: 'alice',
    matchId: 'm1',
    scores: ['0-0'],
  });

  assert.deepEqual(state.predictions, {
    alice: {
      m1: ['0-0'],
    },
  });
});

test('addCustomPlayer appends a trimmed custom player and selects it', () => {
  const state = addCustomPlayer(createInitialState(), ' 小吴 ');

  assert.deepEqual(state.customPlayers, [{ id: 'custom-5c0f-5434', name: '小吴' }]);
  assert.equal(state.selectedPlayerId, 'custom-5c0f-5434');
});

test('addCustomPlayer ignores blank names', () => {
  const state = createInitialState();

  assert.deepEqual(addCustomPlayer(state, '   '), state);
});

test('formatScoreOptionLabel displays odds without changing score values', () => {
  assert.equal(formatScoreOptionLabel({ score: '1-1', odds: 6.5 }), '1:1(6.5)');
  assert.equal(formatScoreOptionLabel({ score: '其他' }), '其他');
});

test('getCopyStatusText returns user-facing copy feedback', () => {
  assert.equal(getCopyStatusText('idle'), '一键复制');
  assert.equal(getCopyStatusText('copied'), '已复制');
  assert.equal(getCopyStatusText('failed'), '复制失败');
});

test('exportPredictionsText renders a WeChat-friendly grouped text dump', () => {
  const state = {
    predictions: {
      alice: {
        m1: ['1-0', '2-1'],
        m2: ['0-0'],
      },
      bob: {
        m1: ['1-1'],
      },
    },
  };

  const text = exportPredictionsText({
    dateLabel: '6月13日',
    matches,
    players,
    state,
  });

  assert.equal(
    text,
    [
      '6月13日比分预测',
      '',
      '03:00 德国 vs 日本',
      '阿哲：1-0, 2-1',
      '北北：1-1',
      '',
      '21:00 西班牙 vs 巴西',
      '阿哲：0-0',
    ].join('\n'),
  );
});
