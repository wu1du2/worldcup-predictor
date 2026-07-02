import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addCustomPlayer,
  buildScoreOptionsForMatch,
  buildPredictionResultRows,
  createInitialState,
  exportAllTimeStatsText,
  exportPredictionsText,
  formatScoreOptionLabel,
  formatScoreTrendLabel,
  getScoreTrendDirection,
  isCorrectScoreOption,
  normalizePredictionState,
  getRoiEmoji,
  getRoiTitle,
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
    homeScore: 1,
    awayScore: 0,
    status: 'post',
  },
  {
    id: 'm2',
    date: '2026-06-13',
    time: '21:00',
    home: '西班牙',
    away: '巴西',
    homeScore: null,
    awayScore: null,
    status: 'pre',
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

test('normalizePredictionState repairs stale local state shapes', () => {
  assert.deepEqual(normalizePredictionState({
    selectedPlayerId: 123,
    customPlayers: null,
    draftPicks: null,
    predictions: {
      playerA: {
        m1: '1-0',
        m2: ['2-1'],
      },
      playerB: null,
    },
    selectedDate: '2026-06-23',
  }), {
    selectedPlayerId: '',
    customPlayers: [],
    draftPicks: {},
    predictions: {
      playerA: {
        m1: [],
        m2: ['2-1'],
      },
    },
    selectedDate: '2026-06-23',
  });
});

test('formatScoreOptionLabel displays odds without changing score values', () => {
  assert.equal(formatScoreOptionLabel({ score: '1-1', odds: 6.5 }), '1:1(6.5)');
  assert.equal(formatScoreOptionLabel({ score: '胜其他', odds: 100 }), '胜其他(100)');
});

test('formatScoreTrendLabel renders first-to-latest odds movement', () => {
  assert.equal(formatScoreTrendLabel({ trend: { changePct: 14.545 } }), '+14.5%');
  assert.equal(formatScoreTrendLabel({ trend: { changePct: -20 } }), '-20%');
  assert.equal(formatScoreTrendLabel({ trend: { changePct: 0.01 } }), '0%');
  assert.equal(formatScoreTrendLabel({}), '');
});

test('getScoreTrendDirection classifies odds movement for UI color', () => {
  assert.equal(getScoreTrendDirection({ trend: { changePct: 14.5 } }), 'up');
  assert.equal(getScoreTrendDirection({ trend: { changePct: -20 } }), 'down');
  assert.equal(getScoreTrendDirection({ trend: { changePct: 0.01 } }), 'flat');
  assert.equal(getScoreTrendDirection({}), 'flat');
});

test('buildScoreOptionsForMatch always preserves the fixed Sporttery score template', () => {
  const options = buildScoreOptionsForMatch([
    { score: '1-1', odds: 6.5, trend: { changePct: 12.5 } },
    { score: '胜其他', odds: 100 },
  ]);

  assert.equal(options.length, 31);
  assert.deepEqual(options.slice(0, 3).map((option) => option.score), ['1-0', '2-0', '2-1']);
  assert.deepEqual(options.slice(-3).map((option) => option.score), ['1-5', '2-5', '负其他']);
  assert.deepEqual(options.find((option) => option.score === '1-1'), {
    score: '1-1',
    odds: 6.5,
    trend: { changePct: 12.5 },
  });
  assert.deepEqual(options.find((option) => option.score === '胜其他'), {
    score: '胜其他',
    odds: 100,
  });
  assert.deepEqual(options.find((option) => option.score === '0-0'), { score: '0-0' });
});

test('isCorrectScoreOption recognizes exact completed scores', () => {
  const match = { status: 'post', homeScore: 2, awayScore: 1 };
  assert.equal(isCorrectScoreOption(match, { score: '2-1' }), true);
  assert.equal(isCorrectScoreOption(match, { score: '1-0' }), false);
  assert.equal(isCorrectScoreOption({ status: 'pre', homeScore: 2, awayScore: 1 }, { score: '2-1' }), false);
});

test('isCorrectScoreOption uses settlement score before final AET score', () => {
  const match = {
    status: 'post',
    statusDetail: 'AET',
    homeScore: 3,
    awayScore: 2,
    settlementHomeScore: 2,
    settlementAwayScore: 2,
    settlementScoreSource: 'espn_linescore_regular_time',
  };

  assert.equal(isCorrectScoreOption(match, { score: '2-2' }), true);
  assert.equal(isCorrectScoreOption(match, { score: '3-2' }), false);
});

test('isCorrectScoreOption recognizes Sporttery other-score buckets', () => {
  assert.equal(isCorrectScoreOption({ status: 'post', homeScore: 6, awayScore: 2 }, { score: '胜其他' }), true);
  assert.equal(isCorrectScoreOption({ status: 'post', homeScore: 6, awayScore: 2 }, { score: '负其他' }), false);
  assert.equal(isCorrectScoreOption({ status: 'post', homeScore: 4, awayScore: 4 }, { score: '平其他' }), true);
  assert.equal(isCorrectScoreOption({ status: 'post', homeScore: 2, awayScore: 6 }, { score: '负其他' }), true);
  assert.equal(isCorrectScoreOption({ status: 'post', homeScore: 5, awayScore: 2 }, { score: '胜其他' }), false);
});

test('getCopyStatusText returns user-facing copy feedback', () => {
  assert.equal(getCopyStatusText('idle'), '一键复制');
  assert.equal(getCopyStatusText('copied'), '已复制');
  assert.equal(getCopyStatusText('failed'), '复制失败');
});

test('getRoiTitle chooses stable titles from the configured ROI bands', () => {
  const cases = [
    { roi: 250, allowed: ['赔率刺客', '庄家噩梦', '剧本阅读者', '赛果穿越者', '大场面先生'] },
    { roi: 150, allowed: ['懂球帝', '赛果预言家', '比分猎手', '神来一笔', '红单体质', '灵感在线'] },
    { roi: 50, allowed: ['稳健大师', '小赚怡情', '准星在线', '有点东西'] },
    { roi: 10, allowed: ['保本战士', '略懂皮毛', '谨慎派', '不亏就赢'] },
    { roi: -10, allowed: ['手感微凉', '惜败选手', '差口气', '险些上岸', '差点回本', '今晚不服'] },
    { roi: -50, allowed: ['快乐赞助商', '赛前很美', '玄学波动', '已经上头', '心态微崩'] },
    { roi: -100, allowed: ['倒霉蛋', '天台观察员', '庄家好友', '玄学受害者'] },
  ];

  for (const item of cases) {
    const seed = `6月13日|张三|${item.roi}`;
    const title = getRoiTitle({ roiPercent: item.roi, seed });
    assert.ok(item.allowed.includes(title), `${title} should be in ${item.allowed.join(',')}`);
    assert.equal(title, getRoiTitle({ roiPercent: item.roi, seed }));
  }
});

test('getRoiEmoji chooses stable emoji from the configured ROI bands', () => {
  const cases = [
    { roi: 250, allowed: ['🚀', '🔥', '👑'] },
    { roi: 150, allowed: ['🎯', '📈', '🏹'] },
    { roi: 50, allowed: ['🟢', '✨', '💪'] },
    { roi: 10, allowed: ['➕', '🟡', '🛟'] },
    { roi: -10, allowed: ['😬', '🥲', '😮‍💨', '🛟', '🤏', '😤'] },
    { roi: -50, allowed: ['💸', '🌧️', '🧨', '🤯', '📉', '😵‍💫'] },
    { roi: -100, allowed: ['❌', '🧊', '🫠', '💀', '😵‍💫', '🧨'] },
  ];

  for (const item of cases) {
    const seed = `6月13日|张三|${item.roi}|emoji`;
    const emoji = getRoiEmoji({ roiPercent: item.roi, seed });
    assert.ok(item.allowed.includes(emoji), `${emoji} should be in ${item.allowed.join(',')}`);
    assert.equal(emoji, getRoiEmoji({ roiPercent: item.roi, seed }));
  }
});

test('exportPredictionsText renders results, raw predictions, and group URL', () => {
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
    scoreOddsByMatch: {
      m1: [
        { score: '1-0', odds: 6 },
        { score: '2-1', odds: 12 },
      ],
    },
    inviteDateLabel: '6月14日',
    inviteMatches: [
      { id: 'm3', home: '加拿大', away: '波黑' },
      { id: 'm4', home: '美国', away: '巴拉圭' },
    ],
    currentGroupUrl: 'https://worldcup-predictor.example/?group=friends',
  });

  assert.equal(
    text,
    [
      '6月13日比分预测',
      '【今日战报】',
      '👑[剧本阅读者] 阿哲｜200%',
      '净收益 +4｜命中 1/1｜成本 2',
      '  ✅ 德国 vs 日本 1-0(6)',
      '🧊[天台观察员] 北北｜-100%',
      '净收益 -1｜命中 0/1｜成本 1',
      '【预测情况】',
      '03:00 德国 vs 日本[1-0]',
      '阿哲：1-0, 2-1',
      '北北：1-1',
      '21:00 西班牙 vs 巴西',
      '阿哲：0-0',
      '[欢迎预测] 6月14日比赛 加拿大 vs 波黑、美国 vs 巴拉圭 https://worldcup-predictor.example/?group=friends',
    ].join('\n'),
  );
});

test('exportPredictionsText labels completed matches with the final score in prediction headers', () => {
  const text = exportPredictionsText({
    dateLabel: '6月14日',
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
        homeScore: null,
        awayScore: null,
        status: 'pre',
      },
    ],
    players,
    state: { predictions: {} },
  });

  assert.match(text, /【预测情况】\n03:00 加拿大 vs 波黑\[1-1\]\n09:00 美国 vs 巴拉圭/);
  assert.doesNotMatch(text, /美国 vs 巴拉圭\[/);
});

test('exportPredictionsText labels and settles AET matches with regular-time settlement score', () => {
  const text = exportPredictionsText({
    dateLabel: '7月2日',
    matches: [
      {
        id: 'm-aet',
        date: '2026-07-02',
        time: '04:00',
        home: '比利时',
        away: '塞内加尔',
        status: 'post',
        statusDetail: 'AET',
        homeScore: 3,
        awayScore: 2,
        settlementHomeScore: 2,
        settlementAwayScore: 2,
        settlementScoreSource: 'espn_linescore_regular_time',
      },
    ],
    players: [{ id: 'p1', name: '张三' }],
    state: { predictions: { p1: { 'm-aet': ['2-2'] } } },
    scoreOddsByMatch: { 'm-aet': [{ score: '2-2', odds: 12 }, { score: '3-2', odds: 20 }] },
  });

  assert.match(text, /04:00 比利时 vs 塞内加尔\[2-2\]/);
  assert.match(text, /张三｜1100%/);
  assert.match(text, /✅ 比利时 vs 塞内加尔 2-2\(12\)/);
  assert.doesNotMatch(text, /3-2\(20\)/);
});

test('exportPredictionsText appends invite date matches before the group URL', () => {
  const text = exportPredictionsText({
    dateLabel: '6月13日',
    matches: [
      {
        id: 'm1',
        time: '03:00',
        home: '德国',
        away: '日本',
        status: 'post',
        homeScore: 1,
        awayScore: 0,
      },
    ],
    players,
    state: { predictions: {} },
    inviteDateLabel: '6月14日',
    inviteMatches: [
      {
        id: 'm2',
        home: '加拿大',
        away: '波黑',
        status: 'pre',
      },
      {
        id: 'm3',
        home: '美国',
        away: '巴拉圭',
        status: 'pre',
      },
    ],
    currentGroupUrl: 'https://worldcup-predictor.example/?group=friends',
  });

  assert.match(
    text,
    /\[欢迎预测\] 6月14日比赛 加拿大 vs 波黑、美国 vs 巴拉圭 https:\/\/worldcup-predictor\.example\/\?group=friends$/,
  );
});

test('exportPredictionsText reports net profit, hit rate, and cost in result rows', () => {
  const text = exportPredictionsText({
    dateLabel: '6月13日',
    matches: [
      {
        id: 'm1',
        date: '2026-06-13',
        time: '03:00',
        home: '加拿大',
        away: '波黑',
        homeScore: 1,
        awayScore: 0,
        status: 'post',
      },
      {
        id: 'm2',
        date: '2026-06-13',
        time: '09:00',
        home: '美国',
        away: '巴拉圭',
        homeScore: 2,
        awayScore: 0,
        status: 'post',
      },
    ],
    players: [{ id: 'zhang', name: '张三' }],
    state: {
      predictions: {
        zhang: {
          m1: ['1-0'],
          m2: ['1-1'],
        },
      },
    },
    scoreOddsByMatch: {
      m1: [{ score: '1-0', odds: 5.3 }],
      m2: [{ score: '2-0', odds: 6 }],
    },
  });

  assert.match(text, /\[[^\]]+\] 张三｜165%\n净收益 \+3\.3｜命中 1\/2｜成本 2/);
});

test('buildPredictionResultRows includes losing players and sorts by ROI then revenue then name', () => {
  const resultRows = buildPredictionResultRows({
    matches: [
      {
        id: 'm1',
        home: '加拿大',
        away: '波黑',
        homeScore: 1,
        awayScore: 1,
        status: 'post',
      },
      {
        id: 'm2',
        home: '美国',
        away: '巴拉圭',
        homeScore: 2,
        awayScore: 0,
        status: 'post',
      },
      {
        id: 'm3',
        home: '德国',
        away: '日本',
        homeScore: null,
        awayScore: null,
        status: 'pre',
      },
    ],
    players: [
      { id: 'zhang', name: '张三' },
      { id: 'li', name: '李四' },
      { id: 'wang', name: '王五' },
    ],
    state: {
      predictions: {
        zhang: {
          m1: ['1-0', '1-1'],
          m2: ['2-0'],
          m3: ['3-0'],
        },
        li: {
          m1: ['1-1'],
        },
        wang: {
          m2: ['1-0'],
        },
      },
    },
    scoreOddsByMatch: {
      m1: [
        { score: '1-1', odds: 8 },
      ],
      m2: [
        { score: '2-0', odds: 6 },
      ],
      m3: [
        { score: '3-0', odds: 20 },
      ],
    },
  });

  assert.deepEqual(resultRows, [
    {
      playerId: 'li',
      playerName: '李四',
      cost: 1,
      revenue: 8,
      netProfit: 7,
      settledMatchCount: 1,
      roiPercent: 700,
      hits: [
        { matchLabel: '加拿大 vs 波黑', score: '1-1', odds: 8 },
      ],
    },
    {
      playerId: 'zhang',
      playerName: '张三',
      cost: 3,
      revenue: 14,
      netProfit: 11,
      settledMatchCount: 2,
      roiPercent: 367,
      hits: [
        { matchLabel: '加拿大 vs 波黑', score: '1-1', odds: 8 },
        { matchLabel: '美国 vs 巴拉圭', score: '2-0', odds: 6 },
      ],
    },
    {
      playerId: 'wang',
      playerName: '王五',
      cost: 1,
      revenue: 0,
      netProfit: -1,
      settledMatchCount: 1,
      roiPercent: -100,
      hits: [],
    },
  ]);
});

test('exportPredictionsText reports empty result states', () => {
  const base = {
    dateLabel: '6月13日',
    players,
    currentGroupUrl: 'https://worldcup-predictor.example/?group=friends',
  };

  assert.match(exportPredictionsText({
    ...base,
    matches: [{ id: 'm1', time: '03:00', home: '德国', away: '日本', status: 'pre' }],
    state: { predictions: { alice: { m1: ['1-0'] } } },
    scoreOddsByMatch: {},
  }), /暂无完场比赛/);

  assert.match(exportPredictionsText({
    ...base,
    matches: [{ id: 'm1', time: '03:00', home: '德国', away: '日本', status: 'post', homeScore: 0, awayScore: 0 }],
    state: { predictions: { alice: { m1: ['1-0'] } } },
    scoreOddsByMatch: { m1: [{ score: '0-0', odds: 9.5 }] },
  }), /\[[^\]]+\] 阿哲｜-100%\n净收益 -1｜命中 0\/1｜成本 1/);
});

test('exportAllTimeStatsText aggregates every completed match for the current group state', () => {
  const text = exportAllTimeStatsText({
    players: [
      { id: 'zhang', name: '张三' },
      { id: 'li', name: '李四' },
      { id: 'empty', name: '没下场' },
    ],
    matches: [
      {
        id: 'm1',
        home: '加拿大',
        away: '波黑',
        homeScore: 1,
        awayScore: 1,
        status: 'post',
      },
      {
        id: 'm2',
        home: '美国',
        away: '巴拉圭',
        homeScore: 2,
        awayScore: 0,
        status: 'post',
      },
      {
        id: 'm3',
        home: '德国',
        away: '日本',
        homeScore: null,
        awayScore: null,
        status: 'pre',
      },
    ],
    state: {
      predictions: {
        zhang: {
          m1: ['1-1', '2-1'],
          m2: ['2-0'],
          m3: ['1-0'],
        },
        li: {
          m1: ['1-0'],
          m2: ['1-1'],
        },
        otherGroupPlayer: {
          m1: ['1-1'],
        },
      },
    },
    scoreOddsByMatch: {
      m1: [{ score: '1-1', odds: 8 }],
      m2: [{ score: '2-0', odds: 6 }],
    },
  });

  assert.equal(
    text,
    [
      '【总榜统计】',
      '张三 ROI 367%｜净收益 +11｜命中 2/2｜成本 3',
      '李四 ROI -100%｜净收益 -2｜命中 0/2｜成本 2',
    ].join('\n'),
  );
});
