import { buildAiRecommendationRows } from './aiPredictionSync.mjs';
import { buildForcedStrategyAiPredictionEntries } from './strategyRouter.mjs';

export const aiStrategyTabDefinitions = {
  stable: {
    id: 'stable',
    label: '稳定型',
    strategyId: 'tem_draw_anchor_lean_homeaway2_draw6_cap22',
  },
  value: {
    id: 'value',
    label: '价值型',
    strategyId: 'tem_poisson_drawguard_context_v3_n2_draw7_5_cap35_p0_006',
  },
  consensus: {
    id: 'consensus',
    label: '共识型',
    strategyId: 'tem_source_consensus_poisson_context_v1_s2_c3_n3_cap6',
  },
};

const orderedTabs = [
  aiStrategyTabDefinitions.stable,
  aiStrategyTabDefinitions.value,
  aiStrategyTabDefinitions.consensus,
];

export function buildAiStrategyTabsForMatch({
  match,
  scoreOptions,
  routerRecommendation = null,
}) {
  if (!match?.id) return [];

  return orderedTabs.map((definition) => {
    const isRouterPick = routerRecommendation?.strategyId === definition.strategyId;
    return {
      ...definition,
      isRouterPick,
      recommendation: isRouterPick && routerRecommendation
        ? routerRecommendation
        : buildForcedRecommendation({
          match,
          scoreOptions,
          strategyId: definition.strategyId,
        }),
    };
  });
}

export function getDefaultAiStrategyTabId(tabs, routerRecommendation = null) {
  return (tabs || []).find((tab) => tab.strategyId === routerRecommendation?.strategyId)?.id
    || tabs?.[0]?.id
    || '';
}

function buildForcedRecommendation({ match, scoreOptions, strategyId }) {
  const [entry] = buildForcedStrategyAiPredictionEntries({
    strategyId,
    matches: [match],
    scoreOddsByMatch: {
      [match.id]: scoreOptions || [],
    },
    historicalResults: [],
  });
  const [row] = buildAiRecommendationRows({
    predictionLog: {
      generatedAt: new Date(0).toISOString(),
      strategy_router: 'frontend_strategy_tabs',
      predictions: [entry],
    },
    scoreOddsByMatch: {
      [match.id]: scoreOptions || [],
    },
  });

  return {
    matchId: row.match_id,
    scores: row.scores,
    scoreLabels: row.score_labels,
    strategyId: row.strategy_id,
    strategyName: row.strategy_name,
    strategyRoi: null,
    roiLabel: '',
    strategyFeature: row.strategy_feature || '',
    routerReason: '',
    matchReasonSummary: row.match_reason_summary || '',
    matchReasonDetail: row.match_reason_detail || '',
    predictionSummary: row.prediction_summary || '',
    predictionRunId: row.prediction_run_id || '',
    predictedAt: row.predicted_at || '',
  };
}
