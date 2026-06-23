export const aiRecommendationPlayerName = 'AI推荐';

const aiRecommendationsByMatchId = {
  'espn-760437': {
    matchId: 'espn-760437',
    roiLabel: '+1.25%',
    reason: '英格兰是明确热门，但克罗地亚经验强、阵容完整，赛前市场也偏向小比分和谨慎开局。AI因此覆盖低比分平局、英格兰小胜和克罗地亚小胜，避免只押单边热门。',
  },
};

export function isAiPlayer(player) {
  return player?.name === aiRecommendationPlayerName;
}

export function getAiRecommendationForMatch(matchId) {
  return aiRecommendationsByMatchId[matchId] || null;
}

export function getAiReasonPreview(reason, { roiLabel = '', summaryLimit = 70, detailLimit = 400 } = {}) {
  const roiText = roiLabel ? `历史ROI ${roiLabel}` : '';
  return {
    roiText,
    summary: truncateText(reason, summaryLimit),
    detail: truncateText(reason, detailLimit),
  };
}

function truncateText(text, limit) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1))}…`;
}
