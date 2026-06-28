import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildForcedStrategyAiPredictionEntries,
  buildRoutedAiPredictionEntries,
  buildRollingStrategyStats,
  routerCandidateStrategyIds,
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
  {
    strategyId: 'tem_draw_anchor_3_max5_5',
    strategyName: '平局锚点 4 格',
    rows: [
      { date: '2026-06-13', time: '03:00', hitScore: '1-1', cost: 4, revenue: 5.3 },
      { date: '2026-06-14', time: '03:00', hitScore: '1-1', cost: 4, revenue: 11 },
      { date: '2026-06-26', time: '04:00', hitScore: '', cost: 4, revenue: 0 },
    ],
  },
  {
    strategyId: 'tem_draw_anchor_capped_1_draw5_5_cap35',
    strategyName: '平局锚点限赔 4 格',
    rows: [
      { date: '2026-06-13', time: '03:00', hitScore: '1-1', cost: 4, revenue: 5.3 },
      { date: '2026-06-14', time: '03:00', hitScore: '1-1', cost: 4, revenue: 11 },
      { date: '2026-06-26', time: '04:00', hitScore: '', cost: 4, revenue: 0 },
    ],
  },
  {
    strategyId: 'tem_consensus_poisson_context_v1_c1_n4_cap7',
    strategyName: '共识泊松 4 格',
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

  assert.equal(route.strategyId, 'tem_draw_anchor_capped_1_draw5_5_cap35');
  assert.equal(route.strategyName, '平局锚点限赔 4 格');
  assert.equal(route.roiLabel, '+103.75%');
  assert.match(route.reason, /滚动历史 ROI/);
  assert.match(route.reason, /葡萄牙 vs 乌兹别克斯坦/);
});

test('routeStrategyForMatch prefers the consensus flagship for knockout matches with explicit external picks', () => {
  const route = routeStrategyForMatch({
    match: {
      id: 'brazil-japan',
      date: '2026-06-30',
      time: '01:00',
      home: '巴西',
      away: '日本',
      stage: 'Round of 32',
      strategyContext: {
        externalPredictions: [
          { source: 'CBS', kind: 'score', score: '2-1', outcome: 'home' },
          { source: 'Ladbrokes', kind: 'score', score: '3-1', outcome: 'home', bothTeamsScore: true },
          { source: 'BetMGM', kind: 'market', outcome: 'home', bothTeamsScore: true },
          { source: 'DraftKings', kind: 'market', outcome: 'home', totalLean: 'under' },
        ],
      },
    },
    scoreOptions: [
      { score: '1-0', odds: 6.25 },
      { score: '1-1', odds: 6.25 },
      { score: '2-1', odds: 6.5 },
      { score: '2-0', odds: 7 },
      { score: '0-0', odds: 10 },
      { score: '3-1', odds: 11 },
      { score: '2-2', odds: 14 },
    ],
    historicalResults,
  });

  assert.equal(route.strategyId, 'tem_consensus_poisson_context_v1_c1_n4_cap7');
  assert.match(route.reason, /外部来源/);
  assert.match(route.reason, /淘汰赛/);
});

test('buildRoutedAiPredictionEntries explains consensus-flagship score choices', () => {
  const entries = buildRoutedAiPredictionEntries({
    matches: [
      {
        id: 'brazil-japan',
        date: '2026-06-30',
        time: '01:00',
        home: '巴西',
        away: '日本',
        stage: 'Round of 32',
        strategyContext: {
          externalPredictions: [
            { source: 'CBS', kind: 'score', score: '2-1', outcome: 'home' },
            { source: 'Ladbrokes', kind: 'score', score: '3-1', outcome: 'home', bothTeamsScore: true },
            { source: 'BetMGM', kind: 'market', outcome: 'home', bothTeamsScore: true },
            { source: 'DraftKings', kind: 'market', outcome: 'home', totalLean: 'under' },
          ],
        },
      },
    ],
    scoreOddsByMatch: {
      'brazil-japan': [
        { score: '1-0', odds: 6.25 },
        { score: '1-1', odds: 6.25 },
        { score: '2-1', odds: 6.5 },
        { score: '2-0', odds: 7 },
        { score: '0-0', odds: 10 },
        { score: '3-1', odds: 11 },
        { score: '2-2', odds: 14 },
      ],
    },
    historicalResults,
  });

  assert.deepEqual(entries[0].scores, ['1-0', '0-0', '1-1']);
  assert.match(entries[0].route.reason, /低赔共识锚点/);
  assert.match(entries[0].route.reason, /外部来源 4 条/);
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
  assert.deepEqual(entries[0].scores, ['1-1', '0-0', '2-2', '1-0']);
  assert.deepEqual(entries[1].scores, ['0-0', '0-1', '1-0', '1-1']);
  assert.equal(entries[1].route.strategyId, 'low_score_basket_4');
  assert.match(entries[1].route.reason, /缺少可用赔率/);
});

test('buildRoutedAiPredictionEntries explains routing standard and selected score reasons', () => {
  const entries = buildRoutedAiPredictionEntries({
    matches: [
      { id: 'explain-odds', date: '2026-06-24', time: '01:00', home: '葡萄牙', away: '乌兹别克斯坦' },
    ],
    scoreOddsByMatch: {
      'explain-odds': scoreOptions,
    },
    historicalResults,
  });

  assert.match(entries[0].route.reason, /选择标准/);
  assert.match(entries[0].route.reason, /历史 ROI/);
  assert.match(entries[0].route.reason, /盘口适配/);
  assert.match(entries[0].route.reason, /比分选择/);
  assert.match(entries[0].route.reason, /1-1/);
  assert.match(entries[0].route.reason, /赔率/);
  assert.ok(entries[0].route.reason.length <= 400);
});

test('buildForcedStrategyAiPredictionEntries can still run market Poisson EV for experiments', () => {
  const fullScoreOptions = [
    '1-0', '2-0', '2-1', '3-0', '3-1', '3-2', '4-0', '4-1', '4-2', '5-0',
    '5-1', '5-2', '胜其他', '0-0', '1-1', '2-2', '3-3', '平其他', '0-1',
    '0-2', '1-2', '0-3', '1-3', '2-3', '0-4', '1-4', '2-4', '0-5',
    '1-5', '2-5', '负其他',
  ].map((score, index) => ({ score, odds: 6 + index }));
  const entries = buildForcedStrategyAiPredictionEntries({
    strategyId: 'market_poisson_ev',
    matches: [
      { id: 'm4', date: '2026-06-25', time: '03:00', home: '波黑', away: '卡塔尔' },
    ],
    scoreOddsByMatch: {
      m4: fullScoreOptions,
    },
    historicalResults,
  });

  assert.equal(entries[0].route.strategyId, 'market_poisson_ev');
  assert.match(entries[0].route.reason, /市场泊松EV/);
  assert.ok(entries[0].scores.length > 0);
  assert.equal(entries[0].pickDetails.length, entries[0].scores.length);
  assert.ok(entries[0].pickDetails.every((pick) => Number.isFinite(Number(pick.probability))));
  assert.ok(entries[0].pickDetails.every((pick) => Number.isFinite(Number(pick.ev))));
});

test('routeStrategyForMatch only considers the production router candidate pool by default', () => {
  const fullScoreOptions = [
    '1-0', '2-0', '2-1', '3-0', '3-1', '3-2', '4-0', '4-1', '4-2', '5-0',
    '5-1', '5-2', '胜其他', '0-0', '1-1', '2-2', '3-3', '平其他', '0-1',
    '0-2', '1-2', '0-3', '1-3', '2-3', '0-4', '1-4', '2-4', '0-5',
    '1-5', '2-5', '负其他',
  ].map((score, index) => ({ score, odds: 6 + index }));
  const route = routeStrategyForMatch({
    match: { id: 'm4', date: '2026-06-25', time: '03:00', home: '波黑', away: '卡塔尔' },
    scoreOptions: fullScoreOptions,
    historicalResults: [
      {
        strategyId: 'market_poisson_ev',
        strategyName: '市场泊松EV',
        rows: [
          { date: '2026-06-18', time: '03:00', hitScore: '1-1', cost: 2, revenue: 120 },
        ],
      },
      {
        strategyId: 'tem_hybrid_draw_poisson_v2_d1_n2',
        strategyName: '平局泊松混合 2 格',
        rows: [
          { date: '2026-06-18', time: '03:00', hitScore: '1-1', cost: 2, revenue: 8 },
        ],
      },
    ],
  });

  assert.deepEqual(routerCandidateStrategyIds, [
    'tem_draw_anchor_capped_1_draw5_5_cap35',
    'tem_poisson_context_v1_n3_cap35_p0_006',
    'tem_consensus_poisson_context_v1_c1_n4_cap7',
  ]);
  assert.ok(routerCandidateStrategyIds.includes(route.strategyId));
  assert.notEqual(route.strategyId, 'market_poisson_ev');
});

test('routeStrategyForMatch keeps qualified rolling leaderboard strategies out of the production router pool', () => {
  const fullScoreOptions = [
    '1-0', '2-0', '2-1', '3-0', '3-1', '3-2', '4-0', '4-1', '4-2', '5-0',
    '5-1', '5-2', '胜其他', '0-0', '1-1', '2-2', '3-3', '平其他', '0-1',
    '0-2', '1-2', '0-3', '1-3', '2-3', '0-4', '1-4', '2-4', '0-5',
    '1-5', '2-5', '负其他',
  ].map((score, index) => ({ score, odds: 6 + index }));
  const qualifiedRows = Array.from({ length: 40 }, (_, index) => ({
    date: '2026-06-13',
    time: `${String(index % 23).padStart(2, '0')}:00`,
    hitScore: index < 8 ? '1-0' : '',
    cost: 4,
    revenue: 16,
  }));

  const route = routeStrategyForMatch({
    match: { id: 'dynamic-1', date: '2026-06-25', time: '03:00', home: '波黑', away: '卡塔尔' },
    scoreOptions: fullScoreOptions,
    historicalResults: [
      {
        strategyId: 'market_consensus_4',
        strategyName: '市场共识四项',
        rows: qualifiedRows,
      },
      {
        strategyId: 'tem_hybrid_draw_poisson_v2_d1_n2',
        strategyName: '平局泊松混合 2 格',
        rows: [
          { date: '2026-06-13', time: '03:00', hitScore: '', cost: 2, revenue: 0 },
        ],
      },
    ],
  });

  assert.notEqual(route.strategyId, 'market_consensus_4');
  assert.ok(routerCandidateStrategyIds.includes(route.strategyId));
  assert.match(route.reason, /三旗舰候选/);
});

test('routeStrategyForMatch does not qualify dynamic strategies using matches after the target kickoff', () => {
  const fullScoreOptions = [
    '1-0', '2-0', '2-1', '3-0', '3-1', '3-2', '4-0', '4-1', '4-2', '5-0',
    '5-1', '5-2', '胜其他', '0-0', '1-1', '2-2', '3-3', '平其他', '0-1',
    '0-2', '1-2', '0-3', '1-3', '2-3', '0-4', '1-4', '2-4', '0-5',
    '1-5', '2-5', '负其他',
  ].map((score, index) => ({ score, odds: 6 + index }));
  const afterCutoffRows = Array.from({ length: 40 }, (_, index) => ({
    date: '2026-06-26',
    time: `${String(index % 23).padStart(2, '0')}:00`,
    hitScore: '1-0',
    cost: 4,
    revenue: 20,
  }));

  const route = routeStrategyForMatch({
    match: { id: 'dynamic-2', date: '2026-06-25', time: '03:00', home: '波黑', away: '卡塔尔' },
    scoreOptions: fullScoreOptions,
    historicalResults: [
      {
        strategyId: 'market_consensus_4',
        strategyName: '市场共识四项',
        rows: afterCutoffRows,
      },
      {
        strategyId: 'tem_hybrid_draw_poisson_v2_d1_n2',
        strategyName: '平局泊松混合 2 格',
        rows: [
          { date: '2026-06-13', time: '03:00', hitScore: '1-1', cost: 2, revenue: 8 },
        ],
      },
    ],
  });

  assert.notEqual(route.strategyId, 'market_consensus_4');
});

test('buildForcedStrategyAiPredictionEntries uses one requested strategy for every match', () => {
  const entries = buildForcedStrategyAiPredictionEntries({
    strategyId: 'context_poisson_ev',
    matches: [
      { id: 'm5', date: '2026-06-25', time: '03:00', home: '波黑', away: '卡塔尔' },
      { id: 'm6', date: '2026-06-25', time: '06:00', home: '摩洛哥', away: '海地' },
    ],
    scoreOddsByMatch: {
      m5: scoreOptions,
      m6: scoreOptions,
    },
    historicalResults,
  });

  assert.deepEqual(entries.map((entry) => entry.route.strategyId), ['context_poisson_ev', 'context_poisson_ev']);
  assert.ok(entries.every((entry) => entry.scores.length > 0));
  assert.match(entries[0].route.reason, /强制使用/);
  assert.match(entries[0].route.reason, /赛前泊松EV/);
});

test('buildForcedStrategyAiPredictionEntries passes match strategy context to the selected strategy', () => {
  let observedContext = null;
  const contextAwareStrategy = {
    id: 'context_probe_strategy',
    name: 'Context Probe',
    description: 'Reads strategy context in tests.',
    selectPicks: ({ odds, context }) => {
      observedContext = context;
      const wantedScore = context?.publicContext?.teamNews?.includes('主队轮换优势') ? '2-0' : '0-0';
      return odds.filter((option) => option.score === wantedScore);
    },
  };

  const entries = buildForcedStrategyAiPredictionEntries({
    strategyId: 'context_probe_strategy',
    matches: [
      {
        id: 'm7',
        date: '2026-06-26',
        time: '04:00',
        home: '厄瓜多尔',
        away: '德国',
        strategyContext: {
          publicContext: {
            teamNews: ['主队轮换优势'],
          },
        },
      },
    ],
    scoreOddsByMatch: {
      m7: [
        { score: '0-0', odds: 8 },
        { score: '2-0', odds: 12 },
      ],
    },
    historicalResults: [],
    strategies: [contextAwareStrategy],
  });

  assert.equal(observedContext.publicContext.teamNews[0], '主队轮换优势');
  assert.deepEqual(entries[0].scores, ['2-0']);
});
