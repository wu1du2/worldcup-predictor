import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aiStrategyTabDefinitions,
  buildAiStrategyTabsForMatch,
  getDefaultAiStrategyTabId,
} from '../src/aiStrategyTabs.mjs';

const match = {
  id: 'm1',
  date: '2026-06-29',
  time: '05:00',
  home: '南非',
  away: '加拿大',
};

const scoreOptions = [
  { score: '1-0', odds: 8 },
  { score: '0-0', odds: 7 },
  { score: '1-1', odds: 5.5 },
  { score: '2-1', odds: 9 },
  { score: '0-1', odds: 8.5 },
  { score: '2-2', odds: 14 },
  { score: '0-2', odds: 18 },
];

test('buildAiStrategyTabsForMatch creates the three flagship strategy tabs', () => {
  const tabs = buildAiStrategyTabsForMatch({ match, scoreOptions });

  assert.deepEqual(tabs.map((tab) => tab.id), ['stable', 'value', 'consensus']);
  assert.deepEqual(tabs.map((tab) => tab.label), ['稳定型', '价值型', '共识型']);
  assert.ok(tabs.every((tab) => tab.recommendation.matchId === 'm1'));
  assert.ok(tabs.every((tab) => tab.recommendation.scores.length > 0));
  assert.ok(tabs.every((tab) => tab.recommendation.routerReason === ''));
  assert.match(tabs[0].recommendation.strategyName, /平局锚点/);
});

test('buildAiStrategyTabsForMatch preserves router reason only on the routed strategy tab', () => {
  const routerRecommendation = {
    matchId: 'm1',
    strategyId: aiStrategyTabDefinitions.value.strategyId,
    strategyName: '赛前泊松EV平局保护',
    roiLabel: '+27.73%',
    scores: ['1-1', '2-0', '0-0'],
    scoreLabels: ['1-1(5.5)', '2-0(10)', '0-0(7)'],
    strategyFeature: '用赛前泊松均衡模型找 EV。',
    routerReason: '南非 vs 加拿大：router 选择「赛前泊松EV平局保护」。',
    matchReasonSummary: '推荐 1-1、2-0、0-0。',
    matchReasonDetail: '本场推荐：1-1、2-0、0-0',
    predictionSummary: '推荐 1-1、2-0、0-0。',
  };

  const tabs = buildAiStrategyTabsForMatch({ match, scoreOptions, routerRecommendation });
  const valueTab = tabs.find((tab) => tab.id === 'value');
  const stableTab = tabs.find((tab) => tab.id === 'stable');

  assert.equal(getDefaultAiStrategyTabId(tabs, routerRecommendation), 'value');
  assert.equal(valueTab.isRouterPick, true);
  assert.equal(valueTab.recommendation.routerReason, routerRecommendation.routerReason);
  assert.deepEqual(valueTab.recommendation.scores, routerRecommendation.scores);
  assert.equal(stableTab.isRouterPick, false);
  assert.equal(stableTab.recommendation.routerReason, '');
});

test('getDefaultAiStrategyTabId falls back to the first tab when router strategy is absent', () => {
  const tabs = buildAiStrategyTabsForMatch({ match, scoreOptions });

  assert.equal(getDefaultAiStrategyTabId(tabs, { strategyId: 'legacy-strategy' }), 'stable');
});
