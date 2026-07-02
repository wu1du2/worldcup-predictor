import { isSettledMatch } from './settlementScore.mjs';

const scoreWeights = {
  roi: 0.35,
  hitRate: 0.05,
  coverage: 0.15,
  shapeHealth: 0.15,
  explainability: 0.15,
  exploration: 0.15,
};

export function getScoreMarketProfile(scoreOptions = []) {
  const odds = normalizeOdds(scoreOptions);
  const homeMin = minOddsByOutcome(odds, 'home');
  const drawMin = minOddsByOutcome(odds, 'draw');
  const awayMin = minOddsByOutcome(odds, 'away');
  const ranked = [
    { side: 'home', value: homeMin },
    { side: 'draw', value: drawMin },
    { side: 'away', value: awayMin },
  ].filter((item) => Number.isFinite(item.value)).sort((a, b) => a.value - b.value);
  const favorite = ranked[0] || { side: 'unknown', value: Infinity };
  const second = ranked[1] || { side: 'unknown', value: Infinity };
  const lowScoreLean = getOdds(odds, '1-1') <= 6.5 || getOdds(odds, '0-0') <= 10.5;
  const favoriteOpponentMin = favorite.side === 'home' ? awayMin : favorite.side === 'away' ? homeMin : Infinity;
  const strongFavorite = favorite.side !== 'draw' && favorite.value <= 6.5 && favoriteOpponentMin - favorite.value >= 3;

  return {
    homeMin: roundMetric(homeMin),
    drawMin: roundMetric(drawMin),
    awayMin: roundMetric(awayMin),
    favoriteSide: favorite.side,
    favoriteMin: roundMetric(favorite.value),
    favoriteEdge: roundMetric(Math.min(second.value, favoriteOpponentMin) - favorite.value),
    lowScoreLean,
    strongFavorite,
    scoreOptions: odds.length,
  };
}

export function filterKnockoutProxyMatches({
  matches = [],
  scoreOddsByMatch = {},
  minScoreOptions = 5,
}) {
  return (matches || [])
    .map((match) => {
      const odds = normalizeOdds(scoreOddsByMatch[match.id]);
      if (!isCompletedMatch(match) || odds.length < minScoreOptions) return null;

      const profile = getScoreMarketProfile(odds);
      const reasons = [];
      const stage = String(match.stage || '');
      const isGroup = /group/i.test(stage);
      const isLateGroup = isGroup && String(match.date || '') >= '2026-06-21';

      if (profile.strongFavorite && profile.lowScoreLean) reasons.push('强弱差明显');
      if (profile.lowScoreLean) reasons.push('保守盘');
      if (isLateGroup) reasons.push('末轮压力');
      if (!isGroup && stage) reasons.push('真实淘汰赛');

      return reasons.length ? { match, profile, reasons } : null;
    })
    .filter(Boolean)
    .sort((a, b) => `${a.match.date || ''} ${a.match.time || ''}`.localeCompare(`${b.match.date || ''} ${b.match.time || ''}`));
}

export function scoreKnockoutBacktestSummary({
  roiPercent = 0,
  hitMatches = 0,
  settledMatches = 0,
  averagePicks = 0,
  explanationScore = 70,
  explorationScore = 70,
  proxyMatches = settledMatches,
  maxHitOdds = 0,
}) {
  const roiScore = clamp(Number(roiPercent) + 60);
  const metrics = {
    roi: Math.min(roiScore, getTailAdjustedRoiCap(maxHitOdds)),
    hitRate: getHitRatePenaltyScore({ hitMatches, settledMatches }),
    coverage: proxyMatches > 0 ? clamp((Number(settledMatches) / Number(proxyMatches)) * 100) : 0,
    shapeHealth: Math.min(getShapeHealth(averagePicks), getTailShapeCap(maxHitOdds)),
    explainability: clamp(explanationScore),
    exploration: clamp(explorationScore),
  };
  const total = Object.entries(scoreWeights).reduce((sum, [key, weight]) => sum + metrics[key] * weight, 0);

  return {
    total: roundMetric(total),
    metrics: Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, roundMetric(value)])),
  };
}

function getHitRatePenaltyScore({ hitMatches, settledMatches }) {
  if (!Number(settledMatches)) return 0;
  const hitRatePercent = (Number(hitMatches) / Number(settledMatches)) * 100;
  return clamp((hitRatePercent / 8) * 100);
}

export function enrichKnockoutProxyBacktestResult(result, {
  explanationScore = 70,
  proxyMatches = result?.settledMatches || 0,
  metadata = {},
} = {}) {
  const rows = result?.rows || [];
  const pickCounts = rows.map((row) => row.picks?.length || 0);
  const maxHitOdds = Math.max(0, ...rows.map((row) => Number(row.hitOdds) || 0));
  const averagePicks = pickCounts.length
    ? roundMetric(pickCounts.reduce((sum, count) => sum + count, 0) / pickCounts.length)
    : 0;
  const explorationScore = getExplorationScore({
    result,
    metadata,
  });
  const score = scoreKnockoutBacktestSummary({
    roiPercent: result?.roiPercent || 0,
    hitMatches: result?.hitMatches || 0,
    settledMatches: result?.settledMatches || 0,
    averagePicks,
    explanationScore,
    explorationScore,
    proxyMatches,
    maxHitOdds,
  });

  return {
    ...result,
    family: metadata.family,
    style: metadata.style,
    parameters: metadata.parameters,
    explanation: metadata.explanation,
    averagePicks,
    maxHitOdds,
    explorationScore,
    knockoutProxyScore: score.total,
    knockoutProxyMetrics: score.metrics,
  };
}

export function getExplorationScore({ result = {}, metadata = {} } = {}) {
  const text = [
    result.strategyId,
    result.strategyName,
    result.description,
    metadata.family,
    metadata.style,
    metadata.explanation,
    JSON.stringify(metadata.parameters || {}),
  ].filter(Boolean).join(' ');

  let score = 35;
  if (metadata.family) score += 10;
  if (metadata.style) score += 10;
  if (metadata.parameters && Object.keys(metadata.parameters).length) score += 15;
  if (String(metadata.explanation || result.description || '').trim().length >= 6) score += 15;
  if (/(poisson|泊松|EV|context|来源|机构|媒体|trend|趋势|赔率变化|market|市场|Dixon|Coles)/i.test(text)) score += 15;

  return clamp(score);
}

export function buildKnockoutProxyBacktestReport({
  dataset,
  results,
  proxyMatches,
} = {}) {
  const sortedResults = [...(results || [])].sort((a, b) => (
    b.knockoutProxyScore - a.knockoutProxyScore
    || b.roiPercent - a.roiPercent
    || b.netProfit - a.netProfit
  ));
  const lines = [
    '# Knockout Proxy Strategy Backtest',
    '',
    '说明：筛选小组赛中更接近淘汰赛压力/盘口形态的已完场比赛；预测只使用赛前 context 和赔率，赛果只在结算阶段读取。',
    '',
    '## Dataset',
    '',
    `- Context files: ${dataset?.contextFiles ?? 0}`,
    `- Matched to DB: ${dataset?.contextsMatchedToDb ?? 0}`,
    `- Proxy matches: ${dataset?.proxyMatches ?? 0}`,
    `- Strategies: ${dataset?.strategies ?? 0}`,
    '',
    '## Proxy Match Filter',
    '',
    '| 日期 | 比赛 | 原因 | 市场形态 |',
    '| --- | --- | --- | --- |',
  ];

  for (const item of proxyMatches || []) {
    const match = item.match || {};
    lines.push([
      `| ${match.date || ''} ${match.time || ''}`,
      `${match.home || ''} vs ${match.away || ''}`,
      (item.reasons || []).join('、'),
      `热门 ${item.profile?.favoriteSide || '-'} ${formatMetric(item.profile?.favoriteMin)}；低比分 ${item.profile?.lowScoreLean ? '是' : '否'} |`,
    ].join(' | '));
  }

  lines.push(
    '',
    '## Ranking',
    '',
    '| 策略 | 分数 | ROI | 命中 | 场次 | 均注 | 分项 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
  );

  for (const result of sortedResults) {
    const metrics = result.knockoutProxyMetrics || {};
    lines.push([
      `| ${result.strategyId}`,
      formatMetric(result.knockoutProxyScore),
      `${formatSigned(result.roiPercent)}%`,
      `${result.hitMatches}/${result.settledMatches}`,
      result.settledMatches,
      formatMetric(result.averagePicks),
      `收益 ${formatMetric(metrics.roi)} / 命中 ${formatMetric(metrics.hitRate)} / 覆盖 ${formatMetric(metrics.coverage)} / 形态 ${formatMetric(metrics.shapeHealth)} / 解释 ${formatMetric(metrics.explainability)} / 探索 ${formatMetric(metrics.exploration)} |`,
    ].join(' | '));
  }

  lines.push('', '## Top Details', '');
  for (const result of sortedResults.slice(0, 10)) {
    lines.push(`### ${result.strategyId} - ${result.strategyName}`);
    lines.push('');
    lines.push(`分数 ${formatMetric(result.knockoutProxyScore)}，ROI ${formatSigned(result.roiPercent)}%，成本 ${formatMetric(result.cost)}，返还 ${formatMetric(result.revenue)}，命中 ${result.hitMatches}/${result.settledMatches}。`);
    lines.push('');
    for (const row of result.rows || []) {
      const picks = (row.picks || []).map((pick) => `${pick.score}(${formatMetric(pick.odds)})`).join(', ');
      lines.push(`- ${row.date} ${row.time} ${row.match} [${row.actualScore}] -> ${picks}；${row.hitScore ? `命中 ${row.hitScore}` : '未中'}，净收益 ${formatSigned(row.netProfit)}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function normalizeOdds(scoreOptions = []) {
  return (scoreOptions || [])
    .filter((option) => option?.score && Number.isFinite(Number(option.odds)))
    .map((option) => ({ score: option.score, odds: Number(option.odds) }));
}

function minOddsByOutcome(odds, outcome) {
  const values = odds
    .filter((option) => getScoreOutcome(option.score) === outcome)
    .map((option) => option.odds);
  return values.length ? Math.min(...values) : Infinity;
}

function getOdds(odds, score) {
  return odds.find((option) => option.score === score)?.odds || Infinity;
}

function getScoreOutcome(score) {
  if (score === '胜其他') return 'home';
  if (score === '平其他') return 'draw';
  if (score === '负其他') return 'away';
  const match = String(score).match(/^(\d+)-(\d+)$/);
  if (!match) return 'unknown';
  const home = Number(match[1]);
  const away = Number(match[2]);
  if (home > away) return 'home';
  if (home === away) return 'draw';
  return 'away';
}

function isCompletedMatch(match) {
  return isSettledMatch({ ...match, status: match?.status || 'post' });
}

function getShapeHealth(averagePicks) {
  if (!Number.isFinite(Number(averagePicks)) || Number(averagePicks) <= 0) return 0;
  const distanceFromTarget = Math.abs(Number(averagePicks) - 2.5);
  return clamp(100 - distanceFromTarget * 20);
}

function getTailAdjustedRoiCap(maxHitOdds) {
  const odds = Number(maxHitOdds) || 0;
  if (odds >= 60) return 80;
  if (odds >= 40) return 88;
  if (odds >= 30) return 94;
  return 100;
}

function getTailShapeCap(maxHitOdds) {
  const odds = Number(maxHitOdds) || 0;
  if (odds >= 60) return 65;
  if (odds >= 40) return 75;
  if (odds >= 30) return 85;
  return 100;
}

function clamp(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function roundMetric(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function formatMetric(value) {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}

function formatSigned(value) {
  const formatted = formatMetric(value);
  return Number(value) > 0 ? `+${formatted}` : formatted;
}
