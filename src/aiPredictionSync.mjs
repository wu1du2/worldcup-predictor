export function buildAiPredictionEntries({ predictionLog, contextsByFile }) {
  const items = Array.isArray(predictionLog.predictions)
    ? predictionLog.predictions
    : [predictionLog];

  return items.map((item) => {
    const context = contextsByFile[item.match_context_file];
    if (!context?.match?.id) {
      throw new Error(`Missing context match id for ${item.match_context_file}.`);
    }

    const scores = (item.prediction?.stakes || [])
      .filter((stake) => typeof stake.score === 'string' && Number(stake.stake) > 0)
      .map((stake) => stake.score);

    if (!scores.length) {
      throw new Error(`Prediction for ${item.match_context_file} has no valid scores.`);
    }

    return {
      matchId: context.match.id,
      scores,
    };
  });
}

export function buildAiRecommendationRows({
  predictionLog,
  contextsByFile = {},
  scoreOddsByMatch = {},
  predictionRunId = '',
  sourceFile = '',
}) {
  const items = Array.isArray(predictionLog.predictions)
    ? predictionLog.predictions
    : [predictionLog];

  return items.map((item) => {
    const matchId = item.matchId || item.route?.matchId || contextsByFile[item.match_context_file]?.match?.id;
    if (!matchId) throw new Error('AI recommendation item missing matchId.');

    const scores = normalizePredictionScores(item);
    if (!scores.length) throw new Error(`AI recommendation ${matchId} has no scores.`);

    const route = item.route || {};
    const reason = route.reason || item.reason || item.prediction?.reason || '';
    const summary = summarizeReason(reason);

    return {
      match_id: matchId,
      scores,
      score_labels: buildScoreLabels(scores, scoreOddsByMatch[matchId] || []),
      strategy_id: route.strategyId || predictionLog.strategy_router || 'main_strategy',
      strategy_name: route.strategyName || item.strategyName || 'AI推荐',
      strategy_roi: Number.isFinite(Number(route.historicalRoiPercent)) ? Number(route.historicalRoiPercent) : null,
      strategy_roi_label: route.roiLabel || '',
      strategy_feature: route.strategyDescription || item.strategyFeature || '',
      router_reason: reason,
      match_reason_summary: summary,
      match_reason_detail: reason || summary,
      prediction_summary: `推荐 ${scores.join('、')}。`,
      context_version: predictionLog.strategy_router || '',
      prediction_run_id: predictionRunId || '',
      predicted_at: predictionLog.generatedAt || new Date().toISOString(),
      source_file: sourceFile || '',
    };
  });
}

function normalizePredictionScores(item) {
  if (Array.isArray(item.scores)) return item.scores.filter((score) => typeof score === 'string');
  return (item.prediction?.stakes || [])
    .filter((stake) => typeof stake.score === 'string' && Number(stake.stake) > 0)
    .map((stake) => stake.score);
}

function buildScoreLabels(scores, scoreOptions) {
  const oddsByScore = new Map((scoreOptions || []).map((option) => [option.score, option.odds]));
  return scores.map((score) => {
    const odds = oddsByScore.get(score);
    return Number.isFinite(Number(odds)) ? `${score}(${formatMetric(Number(odds))})` : score;
  });
}

function summarizeReason(reason) {
  const normalized = String(reason || '').replace(/\s+/g, ' ').trim();
  const marketIndex = normalized.indexOf('当前盘口特征：');
  const summary = marketIndex >= 0 ? normalized.slice(marketIndex) : normalized;
  const sentence = summary.split(/[。；]/).find(Boolean) || summary;
  return `${sentence.replace(/^。+/, '')}。`;
}

function formatMetric(value) {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}
