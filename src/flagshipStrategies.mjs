import { deterministicUuid } from './stableUuid.mjs';

export const flagshipStrategyDefinitions = [
  {
    id: 'stable',
    label: '稳定型',
    strategyId: 'tem_draw_anchor_lean_homeaway2_draw6_cap22',
  },
  {
    id: 'value',
    label: '价值型',
    strategyId: 'tem_poisson_drawguard_context_v3_n2_draw7_5_cap35_p0_006',
  },
  {
    id: 'consensus',
    label: '共识型',
    strategyId: 'tem_source_consensus_poisson_context_v1_s2_c3_n3_cap6',
  },
];

export const flagshipStrategyIds = flagshipStrategyDefinitions.map((strategy) => strategy.strategyId);
export const flagshipStrategySystemIds = flagshipStrategyDefinitions.map((strategy) => deterministicUuid(`system:${strategy.strategyId}`));

export function getFlagshipStrategyRank(strategyId) {
  const rawRank = flagshipStrategyIds.indexOf(strategyId);
  if (rawRank !== -1) return rawRank;
  return flagshipStrategySystemIds.indexOf(strategyId);
}

export function isFlagshipStrategy(strategyId) {
  return getFlagshipStrategyRank(strategyId) !== -1;
}
