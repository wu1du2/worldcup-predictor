export const aiRecommendationPlayerName = 'AI推荐';

const aiRecommendationsByMatchId = {
  'espn-760462': buildRecommendation({
    matchId: 'espn-760462',
    scores: ['1-0', '2-1', '2-0'],
    scoreLabels: ['1-0(8)', '2-1(6)', '2-0(6.25)'],
    strategyName: '热门小胜',
    roiLabel: '-58%',
    strategyFeature: '适合强弱分明但不追大胜的比赛，优先覆盖热门方一球或两球小胜。',
    routerReason: '波黑方向赔率明显更低，2-1、2-0、1-0都处在低赔率区，市场更像是波黑小胜。',
    matchReasonSummary: '波黑占优，但盘口没有推到大胜，选择热门小胜。',
    matchReasonDetail: '2-1 和 2-0 是全场最低赔率，1-0 也在核心区间。3球以上大胜赔率开始抬高，因此不追大比分，覆盖波黑一球或两球小胜。',
    predictionSummary: '推荐波黑1球或2球胜，避开大胜和冷门。',
  }),
  'espn-760463': buildRecommendation({
    matchId: 'espn-760463',
    scores: ['2-1', '1-1', '0-1'],
    scoreLabels: ['2-1(7.5)', '1-1(4.5)', '0-1(10)'],
    strategyName: '胜平负均衡',
    roiLabel: '-20.08%',
    strategyFeature: '适合胜平负都说得通的比赛，分别覆盖主胜、平局、客胜中最被市场认可的比分。',
    routerReason: '1-1 是最低赔率，但瑞士小胜和加拿大小胜赔率也不极端，市场没有完全单边。',
    matchReasonSummary: '平局最热，但双方都有赢球路径，选择均衡覆盖。',
    matchReasonDetail: '1-1 赔率只有 4.5，是最强锚点；瑞士 2-1、加拿大 0-1 都在合理区间。本场不适合只押一边，改用胜平负各拿一个核心比分。',
    predictionSummary: '推荐瑞士小胜、1-1平局、加拿大小胜各一项。',
  }),
  'espn-760464': buildRecommendation({
    matchId: 'espn-760464',
    scores: ['2-0', '3-0', '1-0', '2-1'],
    scoreLabels: ['2-0(5.4)', '3-0(6)', '1-0(6.75)', '2-1(8)'],
    strategyName: '市场共识',
    roiLabel: '-40.62%',
    strategyFeature: '适合盘口集中、热门剧本清晰的比赛，选择市场最认可且不太离谱的比分。',
    routerReason: '摩洛哥优势非常清晰，前四个低赔比分全部是摩洛哥胜。',
    matchReasonSummary: '市场强烈集中在摩洛哥赢球，直接跟随核心比分区。',
    matchReasonDetail: '2-0、3-0、1-0、2-1 是赔率最低的四个比分，且全部指向摩洛哥胜。冷门和平局赔率明显靠后，因此本场用市场共识覆盖热门胜法。',
    predictionSummary: '推荐摩洛哥常规胜法，以零封和小胜为主。',
  }),
  'espn-760465': buildRecommendation({
    matchId: 'espn-760465',
    scores: ['0-1', '1-2', '0-2'],
    scoreLabels: ['0-1(6.85)', '1-2(7)', '0-2(5.8)'],
    strategyName: '热门小胜',
    roiLabel: '-58%',
    strategyFeature: '适合强弱分明但不追大胜的比赛，优先覆盖热门方一球或两球小胜。',
    routerReason: '巴西方向赔率最低，但0-1、1-2也在核心区间，市场更像巴西稳胜而非必然大胜。',
    matchReasonSummary: '巴西是热门，但小胜比分仍很靠前，选择热门小胜。',
    matchReasonDetail: '0-2 是全场最低赔率，0-1 和 1-2 紧随其后。0-3、1-3也有机会，但赔率略高，本次先覆盖巴西一球或两球胜。',
    predictionSummary: '推荐巴西1球或2球胜，不追大比分。',
  }),
  'espn-760466': buildRecommendation({
    matchId: 'espn-760466',
    scores: ['1-0', '1-1', '2-1'],
    scoreLabels: ['1-0(12.5)', '1-1(6.5)', '2-1(16.5)'],
    strategyName: '弱势方偷分',
    roiLabel: '-42%',
    strategyFeature: '适合热门不够稳的比赛，围绕弱势方小胜和平局做覆盖。',
    routerReason: '韩国略热，但1-1赔率很低，南非1-0和2-1仍有可见回报空间。',
    matchReasonSummary: '韩国占优不算碾压，南非有偷分剧本。',
    matchReasonDetail: '韩国 0-1、1-2、0-2 都靠前，但1-1也只有6.5，说明平局路径很强。南非赢球比分赔率较高但没有离谱，本场用弱势方偷分策略覆盖南非小胜和平局。',
    predictionSummary: '推荐南非小胜和平局，赌热门不稳。',
  }),
  'espn-760467': buildRecommendation({
    matchId: 'espn-760467',
    scores: ['1-1', '0-1', '1-2'],
    scoreLabels: ['1-1(6.2)', '0-1(6.5)', '1-2(6.75)'],
    strategyName: '低赔三选',
    roiLabel: '-37.38%',
    strategyFeature: '适合市场核心比分非常集中时，直接选择全场赔率最低的三个比分。',
    routerReason: '最低赔率集中在1-1、墨西哥0-1、墨西哥1-2，市场略偏墨西哥不败。',
    matchReasonSummary: '核心赔率集中，直接选择最低三项。',
    matchReasonDetail: '1-1 是全场最低赔率，0-1和1-2紧随其后，说明市场主要在墨西哥不败和小比分胶着之间摇摆。本场不额外发散，直接低赔三选。',
    predictionSummary: '推荐1-1和墨西哥小胜方向。',
  }),
};

export function isAiPlayer(player) {
  return player?.name === aiRecommendationPlayerName;
}

export function getAiRecommendationForMatch(matchId) {
  return aiRecommendationsByMatchId[matchId] || null;
}

export function getAiRecommendedScores(matchId) {
  const recommendation = getAiRecommendationForMatch(matchId);
  return Array.isArray(recommendation?.scores) ? recommendation.scores : [];
}

export function getAiReasonPreview(reason, { roiLabel = '', summaryLimit = 70, detailLimit = 400 } = {}) {
  const roiText = roiLabel ? `历史ROI ${roiLabel}` : '';
  return {
    roiText,
    summary: truncateText(reason, summaryLimit),
    detail: truncateText(reason, detailLimit),
  };
}

function buildRecommendation(recommendation) {
  return {
    ...recommendation,
    reason: recommendation.matchReasonSummary,
  };
}

function truncateText(text, limit) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1))}…`;
}
