export const aiRecommendationPlayerName = 'AI推荐';

const aiRecommendationsByMatchId = {
  'espn-760437': {
    matchId: 'espn-760437',
    reason: '主策略是低比分篮子 v0，本场 context 中 0-0、0-1、1-0、1-1 均有可用赔率。赛前媒体、赔率市场和阵容信息共同指向：英格兰是明确热门，但克罗地亚经验强、市场也偏向 under 2.5/谨慎开局。因此这场不触发候选策略的激进改动，保留低比分篮子，输出四个比分各 1 注。',
  },
};

export function isAiPlayer(player) {
  return player?.name === aiRecommendationPlayerName;
}

export function getAiRecommendationForMatch(matchId) {
  return aiRecommendationsByMatchId[matchId] || null;
}

export function getAiReasonPreview(reason, { summaryLimit = 50, detailLimit = 400 } = {}) {
  return {
    summary: truncateText(reason, summaryLimit),
    detail: truncateText(reason, detailLimit),
  };
}

function truncateText(text, limit) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1))}…`;
}
