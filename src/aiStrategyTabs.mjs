import { buildAiRecommendationRows } from './aiPredictionSync.mjs';
import { flagshipStrategyDefinitions } from './flagshipStrategies.mjs';
import { deterministicUuid } from './stableUuid.mjs';
import { buildForcedStrategyAiPredictionEntries } from './strategyRouter.mjs';

export const aiStrategyTabDefinitions = Object.fromEntries(
  flagshipStrategyDefinitions.map((definition) => [definition.id, definition]),
);

export function buildAiStrategyTabsForMatch({
  match,
  scoreOptions,
  routerRecommendation = null,
  strategyStats = [],
}) {
  if (!match?.id) return [];
  const statsByStrategyId = new Map((strategyStats || []).map((row) => [row.strategyId, row]));

  return flagshipStrategyDefinitions.map((definition) => {
    const isRouterPick = routerRecommendation?.strategyId === definition.strategyId;
    const stats = statsByStrategyId.get(definition.strategyId)
      || statsByStrategyId.get(deterministicUuid(`system:${definition.strategyId}`));
    return {
      ...definition,
      isRouterPick,
      recommendation: withStrategyStats(isRouterPick && routerRecommendation
        ? routerRecommendation
        : buildForcedRecommendation({
          match,
          scoreOptions,
          strategyId: definition.strategyId,
        }), stats),
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

function withStrategyStats(recommendation, stats) {
  if (!recommendation || !stats) return recommendation;
  const strategyRoi = Number(stats.roi);
  if (!Number.isFinite(strategyRoi)) return recommendation;
  return {
    ...recommendation,
    strategyRoi,
    roiLabel: recommendation.roiLabel || formatStrategyRoi(strategyRoi),
  };
}

function formatStrategyRoi(value) {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
  return `${rounded > 0 ? '+' : ''}${text}%`;
}
