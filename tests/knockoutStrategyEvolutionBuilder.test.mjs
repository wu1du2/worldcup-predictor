import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildKnockoutStrategyEvolutionData,
  formatKnockoutStrategyEvolutionDataModule,
} from '../src/knockoutStrategyEvolutionBuilder.mjs';

const strategies = [
  { id: 'tem_draw_anchor_tail', name: '平局尾部实验', family: 'draw_anchor' },
  { id: 'tem_poisson_clean', name: '泊松精选实验', family: 'poisson_ev' },
  { id: 'tem_consensus_wide', name: '共识扩展实验', family: 'market_consensus' },
];

const results = [
  result('low_score_basket_4', '低比分篮子', 59.4, { roi: 45.5, hitRate: 37.5, coverage: 100, shapeHealth: 70, explainability: 70 }),
  result('tem_draw_anchor_3_max5_5', '平局锚点 4 格', 70.5, { roi: 69.9, hitRate: 32.1, coverage: 100, shapeHealth: 86, explainability: 78 }),
  result('favorite_draw_saver_4', '热门平局保护', 48.2, { roi: 12, hitRate: 33.9, coverage: 100, shapeHealth: 70, explainability: 78 }),
  result('context_poisson_ev', '赛前泊松EV基础', 55.6, { roi: 38.2, hitRate: 16.1, coverage: 100, shapeHealth: 76, explainability: 84 }),
  result('context_poisson_ev_v2', '赛前泊松EV精选', 63.1, { roi: 57.7, hitRate: 10.7, coverage: 100, shapeHealth: 88, explainability: 84 }),
  result('market_poisson_ev', '市场泊松高波动', 49.1, { roi: 18.3, hitRate: 3.6, coverage: 100, shapeHealth: 96, explainability: 84 }),
  result('lowest_odds_3', '最低赔率三项', 60.5, { roi: 38.9, hitRate: 39.3, coverage: 100, shapeHealth: 90, explainability: 70 }),
  result('market_consensus_sources', '市场来源共识', 63.5, { roi: 38.9, hitRate: 39.3, coverage: 100, shapeHealth: 90, explainability: 90 }),
  result('market_consensus_4', '市场共识四项', 58.2, { roi: 29.3, hitRate: 44.6, coverage: 100, shapeHealth: 70, explainability: 90 }),
  result('tem_draw_anchor_tail', '平局尾部实验', 70.2, { roi: 80, hitRate: 28.6, coverage: 100, shapeHealth: 65, explainability: 78 }, { maxHitOdds: 75 }),
  result('tem_poisson_clean', '泊松精选实验', 66.2, { roi: 63, hitRate: 12, coverage: 100, shapeHealth: 92, explainability: 84 }, { maxHitOdds: 24 }),
  result('tem_consensus_wide', '共识扩展实验', 61.1, { roi: 35, hitRate: 44, coverage: 100, shapeHealth: 88, explainability: 90 }, { maxHitOdds: 28 }),
];

test('buildKnockoutStrategyEvolutionData appends one automatic experiment per flagship family', () => {
  const data = buildKnockoutStrategyEvolutionData({
    results,
    strategies,
    generatedAt: '2026-06-28T12:30:00.000Z',
    proxyMatches: 56,
  });

  assert.equal(data.generatedAt, '2026-06-28T12:30:00.000Z');
  assert.equal(data.proxyMatches, 56);
  assert.deepEqual(data.families.map((family) => family.id), [
    'knockout_stable',
    'knockout_value',
    'knockout_consensus',
  ]);
  assert.ok(data.families.every((family) => family.versions.length === 4));
  assert.deepEqual(data.families.map((family) => family.versions.at(-1).label), [
    '平局尾部实验',
    '泊松精选实验',
    '共识扩展实验',
  ]);
});

test('buildKnockoutStrategyEvolutionData rejects tail-driven experiments and promotes clean improvements', () => {
  const data = buildKnockoutStrategyEvolutionData({ results, strategies, proxyMatches: 56 });
  const stable = data.families.find((family) => family.id === 'knockout_stable');
  const value = data.families.find((family) => family.id === 'knockout_value');
  const consensus = data.families.find((family) => family.id === 'knockout_consensus');

  assert.equal(stable.versions.at(-1).status, 'discarded');
  assert.match(stable.versions.at(-1).verdict, /高赔尾部/);
  assert.equal(value.versions.at(-1).status, 'active');
  assert.equal(value.versions.filter((version) => version.status === 'active').length, 1);
  assert.equal(consensus.versions.at(-1).status, 'discarded');
});

test('formatKnockoutStrategyEvolutionDataModule writes an importable module', async () => {
  const data = buildKnockoutStrategyEvolutionData({
    results,
    strategies,
    generatedAt: '2026-06-28T12:30:00.000Z',
    proxyMatches: 56,
  });
  const moduleText = formatKnockoutStrategyEvolutionDataModule(data);

  assert.match(moduleText, /knockoutStrategyEvolutionGeneratedAt/);
  assert.match(moduleText, /knockoutStrategyEvolutionFamilies/);
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleText).toString('base64')}`;
  const imported = await import(moduleUrl);
  assert.equal(imported.knockoutStrategyEvolutionGeneratedAt, '2026-06-28T12:30:00.000Z');
  assert.equal(imported.knockoutStrategyEvolutionFamilies.length, 3);
});

function result(strategyId, strategyName, score, metrics, overrides = {}) {
  return {
    strategyId,
    strategyName,
    knockoutProxyScore: score,
    knockoutProxyMetrics: metrics,
    roiPercent: metrics.roi - 60,
    hitMatches: Math.round(metrics.hitRate / 10),
    settledMatches: 56,
    averagePicks: 3,
    maxHitOdds: overrides.maxHitOdds || 20,
    ...overrides,
  };
}
