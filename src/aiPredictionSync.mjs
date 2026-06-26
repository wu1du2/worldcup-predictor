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
    const scoreLabels = buildScoreLabels(scores, scoreOddsByMatch[matchId] || []);
    const pickDetails = normalizePickDetails(item.pickDetails, scoreOddsByMatch[matchId] || []);
    const reasonParts = buildRecommendationReasonParts({
      reason,
      scores,
      scoreLabels,
      pickDetails,
    });

    return {
      match_id: matchId,
      scores,
      score_labels: scoreLabels,
      strategy_id: route.strategyId || predictionLog.strategy_router || 'main_strategy',
      strategy_name: route.strategyName || item.strategyName || 'AI推荐',
      strategy_roi: Number.isFinite(Number(route.historicalRoiPercent)) ? Number(route.historicalRoiPercent) : null,
      strategy_roi_label: route.roiLabel || '',
      strategy_feature: route.strategyDescription || item.strategyFeature || '',
      router_reason: reasonParts.routerReason,
      match_reason_summary: reasonParts.summary,
      match_reason_detail: reasonParts.detail,
      prediction_summary: `推荐 ${scores.join('、')}。`,
      context_version: predictionLog.strategy_router || '',
      prediction_run_id: predictionRunId || '',
      predicted_at: predictionLog.generatedAt || new Date().toISOString(),
      source_file: sourceFile || '',
    };
  });
}

function buildRecommendationReasonParts({ reason, scores, scoreLabels, pickDetails = [] }) {
  const normalized = normalizeText(reason);
  const [routerText, scoreText = ''] = splitScoreSelection(normalized);
  const scoreDetails = buildScoreDetailLines({ scoreText, scores, scoreLabels, pickDetails });
  const routerReason = summarizeRouterReason(routerText) || trimSentence(routerText) || normalized;
  const summary = buildSummary({ scoreText, scores });

  return {
    routerReason,
    summary,
    detail: [
      `本场推荐：${scores.join('、')}`,
      ...scoreDetails,
    ].join('\n'),
  };
}

function summarizeRouterReason(routerText) {
  const text = normalizeText(routerText);
  if (!text) return '';

  const firstSentence = text.split('。').find(Boolean) || '';
  const candidateType = text.match(/本策略来自([^。；]+)/)?.[1] || '';
  const roi = text.match(/滚动历史 ROI ([^，；。]+)/)?.[1] || '';
  const sample = text.match(/样本 ([^；。]+)/)?.[1] || '';
  const totalScore = text.match(/综合 ([^；。]+)/)?.[1] || '';
  const market = text.match(/盘口：([^。]+)/)?.[1] || '';
  const marketShort = market.split('，').slice(0, 2).join('，');
  const metricParts = [
    roi ? `历史${roi}` : '',
    sample ? `样本${sample}` : '',
    totalScore ? `综合${totalScore}` : '',
  ].filter(Boolean).join('，');

  return trimSentence([
    firstSentence,
    candidateType ? `${candidateType}` : '',
    metricParts,
    marketShort,
  ].filter(Boolean).join('；'));
}

function normalizePredictionScores(item) {
  if (Array.isArray(item.scores)) return item.scores.filter((score) => typeof score === 'string');
  return (item.prediction?.stakes || [])
    .filter((stake) => typeof stake.score === 'string' && Number(stake.stake) > 0)
    .map((stake) => stake.score);
}

function normalizePickDetails(pickDetails, scoreOptions) {
  const oddsByScore = new Map((scoreOptions || []).map((option) => [option.score, Number(option.odds)]));
  return (pickDetails || [])
    .filter((pick) => pick?.score)
    .map((pick) => {
      const odds = Number.isFinite(Number(pick.odds)) ? Number(pick.odds) : oddsByScore.get(pick.score);
      const probability = Number.isFinite(Number(pick.probability)) ? Number(pick.probability) : null;
      const ev = Number.isFinite(Number(pick.ev))
        ? Number(pick.ev)
        : probability !== null && Number.isFinite(odds)
          ? roundMetric((probability * odds) - 1)
          : null;
      return {
        score: pick.score,
        ...(Number.isFinite(odds) ? { odds } : {}),
        ...(probability !== null ? { probability } : {}),
        ...(ev !== null ? { ev } : {}),
      };
    });
}

function buildScoreLabels(scores, scoreOptions) {
  const oddsByScore = new Map((scoreOptions || []).map((option) => [option.score, option.odds]));
  return scores.map((score) => {
    const odds = oddsByScore.get(score);
    return Number.isFinite(Number(odds)) ? `${score}(${formatMetric(Number(odds))})` : score;
  });
}

function buildSummary({ scoreText, scores }) {
  const normalized = normalizeText(scoreText);
  if (!normalized) return `推荐 ${scores.join('、')}。`;
  const sentence = normalized
    .replace(/^标准是[^。]*。?/, '')
    .split(/[。；]/)
    .find((part) => scores.some((score) => part.includes(score)))
    || normalized;
  return `推荐 ${scores.join('、')}：${trimSentence(sentence)}`;
}

function buildScoreDetailLines({ scoreText, scores, scoreLabels, pickDetails }) {
  const normalized = normalizeText(scoreText);
  const labelsByScore = new Map((scoreLabels || []).map((label, index) => [scores[index], label]));
  const detailsByScore = new Map((pickDetails || []).map((pick) => [pick.score, pick]));

  return scores.map((score) => {
    const pickDetail = detailsByScore.get(score);
    if (hasProbabilityEv(pickDetail)) {
      return `- ${score}：${formatProbabilityEvDetail(pickDetail)}`;
    }

    const extractedDetail = extractDetailForScore(normalized, score, scores);
    const detail = extractedDetail
      ? stripLeadingScore(extractedDetail, score)
      : `${labelsByScore.get(score) || score} 按当前策略进入推荐。`;
    return `- ${score}：${trimSentence(detail)}`;
  });
}

function hasProbabilityEv(pick) {
  return Number.isFinite(Number(pick?.probability)) && Number.isFinite(Number(pick?.ev));
}

function formatProbabilityEvDetail(pick) {
  const parts = [
    `预计概率 ${formatPercent(Number(pick.probability))}`,
    `EV ${formatSignedMetric(Number(pick.ev))}`,
    Number.isFinite(Number(pick.odds)) ? `赔率 ${formatMetric(Number(pick.odds))}` : '',
  ].filter(Boolean);
  return `${parts.join('，')}。`;
}

function extractDetailForScore(text, score, scores) {
  if (!text) return '';
  const start = text.indexOf(score);
  if (start < 0) return '';

  const nextStarts = scores
    .filter((candidate) => candidate !== score)
    .map((candidate) => text.indexOf(candidate, start + score.length))
    .filter((index) => index > start);
  const end = nextStarts.length ? Math.min(...nextStarts) : text.length;
  return cleanDetail(text.slice(start, end));
}

function splitScoreSelection(reason) {
  const marker = '比分选择：';
  const index = reason.indexOf(marker);
  if (index < 0) return [reason, ''];
  return [
    reason.slice(0, index),
    reason.slice(index + marker.length),
  ];
}

function stripLeadingScore(detail, score) {
  const escapedScore = score.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return cleanDetail(detail.replace(new RegExp(`^${escapedScore}\\s*`), ''));
}

function cleanDetail(text) {
  return normalizeText(text)
    .replace(/^标准是[^。]*。/, '')
    .replace(/^[，,；;。.\s]+/, '')
    .replace(/[；;。.\s]+$/, '');
}

function trimSentence(text) {
  const cleaned = normalizeText(text).replace(/^。+/, '');
  return cleaned.endsWith('。') ? cleaned : `${cleaned}。`;
}

function normalizeText(reason) {
  const normalized = String(reason || '').replace(/\s+/g, ' ').trim();
  return normalized;
}

function formatMetric(value) {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}

function roundMetric(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatPercent(value) {
  return `${formatMetric(Number(value) * 100)}%`;
}

function formatSignedMetric(value) {
  const formatted = formatMetric(value);
  return Number(value) > 0 ? `+${formatted}` : formatted;
}
