import { defaultAiPredictionScores } from './aiPredictionBatch.mjs';
import { candidateStrategies } from './strategyCandidates.mjs';
import { getExternalPredictionStrength } from './sourceConsensusStrategy.mjs';

const fallbackStrategyId = 'low_score_basket_4';
const dynamicRouterCandidateLimit = 0;
const dynamicCandidateMinSettledMatches = 40;
const dynamicCandidateMinHitMatches = 3;
const dynamicCandidateMinRoiPercent = 0;
const dynamicCandidateMaxAveragePicks = 4.5;
export const routerCandidateStrategyIds = [
  'tem_draw_anchor_3_max5_5',
  'context_poisson_ev_v2',
  'market_consensus_sources',
];

export function buildRollingStrategyStats({ historicalResults, cutoffDate, cutoffTime = '00:00' }) {
  const cutoffKey = buildDateTimeKey(cutoffDate, cutoffTime);
  const stats = {};

  for (const result of historicalResults || []) {
    const rows = (result.rows || []).filter((row) => buildDateTimeKey(row.date, row.time) < cutoffKey);
    const cost = roundMetric(sum(rows.map((row) => Number(row.cost) || 0)));
    const revenue = roundMetric(sum(rows.map((row) => Number(row.revenue) || 0)));
    const netProfit = roundMetric(revenue - cost);
    stats[result.strategyId] = {
      strategyId: result.strategyId,
      strategyName: result.strategyName,
      settledMatches: rows.length,
      cost,
      revenue,
      netProfit,
      roiPercent: cost > 0 ? roundMetric((netProfit / cost) * 100) : 0,
      hitMatches: rows.filter((row) => row.hitScore).length,
    };
  }

  return stats;
}

export function routeStrategyForMatch({
  match,
  scoreOptions,
  historicalResults,
  strategies = candidateStrategies,
}) {
  const odds = normalizeOdds(scoreOptions);
  const rollingStats = buildRollingStrategyStats({
    historicalResults,
    cutoffDate: match.date,
    cutoffTime: match.time,
  });
  const dynamicCandidateIds = getDynamicRouterCandidateIds({ strategies, rollingStats });
  const routerStrategies = getRouterCandidateStrategies(strategies, dynamicCandidateIds);

  if (!odds.length) {
    const fallbackStats = rollingStats[fallbackStrategyId] || emptyStats(fallbackStrategyId);
    return buildRoute({
      match,
      strategy: findStrategy(routerStrategies, fallbackStrategyId),
      stats: fallbackStats,
      confidence: 0.35,
      reason: `${formatMatch(match)} 缺少可用赔率，router 不强行判断盘口结构，回退到低比分篮子，保证 AI 推荐仍可覆盖。`,
    });
  }

  const ranked = routerStrategies
    .map((strategy) => ({
      strategy,
      stats: rollingStats[strategy.id] || emptyStats(strategy.id),
      featureScore: scoreStrategyFeatures({ strategy, odds, match }),
    }))
    .filter((item) => strategyCanPick(item.strategy, odds, match))
    .map((item) => ({
      ...item,
      isDynamicCandidate: dynamicCandidateIds.includes(item.strategy.id),
      routerScore: roundMetric((item.stats.roiPercent / 250) + item.featureScore),
    }))
    .sort((a, b) => (
      b.routerScore - a.routerScore
      || b.stats.roiPercent - a.stats.roiPercent
      || a.strategy.id.localeCompare(b.strategy.id)
    ));

  const selected = ranked[0] || {
    strategy: findStrategy(routerStrategies, fallbackStrategyId),
    stats: rollingStats[fallbackStrategyId] || emptyStats(fallbackStrategyId),
    featureScore: 0,
    routerScore: 0,
  };

  return buildRoute({
    match,
    strategy: selected.strategy,
    stats: selected.stats,
    confidence: clamp(0.45 + Math.max(0, selected.routerScore) / 4, 0.45, 0.85),
    reason: buildReason({ match, selected, odds }),
  });
}

export function buildRoutedAiPredictionEntries({
  matches,
  scoreOddsByMatch,
  historicalResults,
  strategies = candidateStrategies,
}) {
  return (matches || [])
    .filter((match) => match?.id)
    .map((match) => {
      const scoreOptions = scoreOddsByMatch?.[match.id] || [];
      const route = routeStrategyForMatch({
        match,
        scoreOptions,
        historicalResults,
        strategies,
      });
      const pickDetails = pickDetailsForRoute({ route, scoreOptions, strategies, match });
      const picks = pickDetails.map((pick) => pick.score);
      return {
        matchId: match.id,
        scores: picks,
        pickDetails,
        route: withScoreSelectionReason({ route, picks: pickDetails, scoreOptions }),
      };
    });
}

export function buildForcedStrategyAiPredictionEntries({
  strategyId,
  matches,
  scoreOddsByMatch,
  historicalResults,
  strategies = candidateStrategies,
}) {
  const strategy = findStrategy(strategies, strategyId);
  if (!strategy || strategy.id !== strategyId) {
    throw new Error(`Unknown forced strategy: ${strategyId}`);
  }

  return (matches || [])
    .filter((match) => match?.id)
    .map((match) => {
      const scoreOptions = scoreOddsByMatch?.[match.id] || [];
      const stats = buildRollingStrategyStats({
        historicalResults,
        cutoffDate: match.date,
        cutoffTime: match.time,
      })[strategy.id] || emptyStats(strategy.id);
      const route = buildRoute({
        match,
        strategy,
        stats,
        confidence: 0.7,
        reason: [
          `${formatMatch(match)}：强制使用「${strategy.name}」。`,
          `滚动历史 ROI ${formatSignedPercent(stats.roiPercent)}，样本 ${stats.settledMatches} 场。`,
          `当前任务要求用该策略预测全部后续场次。`,
        ].join(''),
      });
      const pickDetails = pickDetailsForRoute({ route, scoreOptions, strategies, match });
      const picks = pickDetails.map((pick) => pick.score);
      return {
        matchId: match.id,
        scores: picks,
        pickDetails,
        route: withScoreSelectionReason({
          route,
          picks: pickDetails,
          scoreOptions,
        }),
      };
    });
}

export function pickScoresForRoute({ route, scoreOptions, strategies = candidateStrategies, match = null }) {
  return pickDetailsForRoute({ route, scoreOptions, strategies, match }).map((pick) => pick.score);
}

function pickDetailsForRoute({ route, scoreOptions, strategies = candidateStrategies, match = null }) {
  if (route.strategyId === fallbackStrategyId && !normalizeOdds(scoreOptions).length) {
    return defaultAiPredictionScores.map((score) => ({ score }));
  }

  const strategy = findStrategy(strategies, route.strategyId);
  const picks = uniquePicks(strategy.selectPicks({
    match,
    odds: normalizeOdds(scoreOptions),
    context: match?.strategyContext || {},
  }) || []);
  return picks.length ? picks : defaultAiPredictionScores.map((score) => ({ score }));
}

function buildRoute({ match, strategy, stats, confidence, reason }) {
  return {
    matchId: match.id,
    match: formatMatch(match),
    strategyId: strategy.id,
    strategyName: strategy.name,
    strategyDescription: strategy.description,
    historicalRoiPercent: stats.roiPercent,
    roiLabel: formatSignedPercent(stats.roiPercent),
    historicalMatches: stats.settledMatches,
    confidence: roundMetric(confidence),
    reason,
  };
}

function buildReason({ match, selected, odds }) {
  const market = describeMarket(odds);
  const candidateType = selected.isDynamicCandidate ? '流动候选' : '三旗舰候选';
  const sourceText = selected.strategy.id === 'market_consensus_sources'
    ? `外部来源 ${getExternalPredictionStrength(match?.strategyContext || {})} 条；${isKnockoutMatch(match) ? '淘汰赛优先信市场主线。' : '非淘汰赛按普通权重处理。'}`
    : '';
  return [
    `${formatMatch(match)}：选「${selected.strategy.name}」。`,
    `选择标准：生产 router 只在三旗舰中排序；候选策略按历史 ROI/250 + 盘口适配分排序。本策略来自${candidateType}。`,
    `本场：滚动历史 ROI ${formatSignedPercent(selected.stats.roiPercent)}，样本 ${selected.stats.settledMatches}；适配 ${formatMetric(selected.featureScore)}，综合 ${formatMetric(selected.routerScore)}。`,
    sourceText,
    `盘口：${market}。`,
  ].filter(Boolean).join('');
}

function withScoreSelectionReason({ route, picks, scoreOptions }) {
  const scoreReason = buildScoreSelectionReason({
    strategyId: route.strategyId,
    picks,
    scoreOptions: normalizeOdds(scoreOptions),
  });
  return {
    ...route,
    reason: `${route.reason}${scoreReason}`,
  };
}

function buildScoreSelectionReason({ strategyId, picks, scoreOptions }) {
  const pickDetails = normalizePickDetails(picks);
  if (!pickDetails.length) return '比分选择：没有可用比分，使用默认低比分覆盖。';

  const scoreDetails = pickDetails.map((pick) => describePickedScore({ strategyId, pick, scoreOptions }));
  return `比分选择：${getStrategyPickStandard(strategyId)}${scoreDetails.join('；')}。`;
}

function getStrategyPickStandard(strategyId) {
  if (strategyId === 'tem_draw_anchor_3_max5_5') {
    return '标准是平局赔率低时围绕平局，并加一个低比分保护。';
  }
  if (strategyId === 'tem_hybrid_draw_poisson_v2_d1_n2') {
    return '标准是先保 1-1，再用赛前泊松 EV 补位。';
  }
  if (strategyId === 'context_poisson_ev_v3') {
    return '标准是用赛前 context 估进球，做低比分/平局修正后按 EV 取前列。';
  }
  if (strategyId === 'context_poisson_ev_v2') {
    return '标准是用赛前 context 估进球，提高概率门槛后按 EV 精选。';
  }
  if (strategyId === 'market_consensus_sources') {
    return '标准是优先采纳机构明确比分，再用方向预测和赔率低位补足。';
  }
  if (strategyId === fallbackStrategyId) {
    return '标准是缺赔率时覆盖最常见低比分。';
  }
  return '标准是按当前策略规则和赔率排序。';
}

function describePickedScore({ strategyId, pick, scoreOptions }) {
  const score = typeof pick === 'string' ? pick : pick.score;
  const option = scoreOptions.find((item) => item.score === score);
  const oddsText = option ? `赔率 ${formatMetric(option.odds)}` : '赔率缺失';
  const valueText = formatProbabilityEvText(pick);

  if (valueText) return `${score} ${valueText}，${oddsText}`;
  if (strategyId === 'market_consensus_sources' && pick?.reason) {
    return `${score} ${pick.reason}，${oddsText}`;
  }

  if (strategyId === 'tem_draw_anchor_3_max5_5') {
    if (score === '1-1') return `${score} 核心平局，${oddsText}`;
    if (score === '2-2') return `${score} 高进球平局扩展，${oddsText}`;
    if (score === '0-0') return `${score} 低节奏平局，${oddsText}`;
    return `${score} 低比分保护，${oddsText}`;
  }

  if (strategyId === 'tem_hybrid_draw_poisson_v2_d1_n2') {
    if (score === '1-1') return `${score} 固定平局锚点，${oddsText}`;
    return `${score} 泊松 EV 补位，${oddsText}`;
  }

  if (strategyId === 'context_poisson_ev_v2' || strategyId === 'context_poisson_ev_v3') {
    return `${score} EV 靠前，${oddsText}`;
  }

  if (strategyId === fallbackStrategyId) {
    return `${score} 低比分默认覆盖，${oddsText}`;
  }

  return `${score} 符合策略规则，${oddsText}`;
}

function scoreStrategyFeatures({ strategy, odds, match = null }) {
  const market = getMarketFeatures(odds);
  const externalPredictionStrength = getExternalPredictionStrength(match?.strategyContext || {});
  const knockoutBonus = isKnockoutMatch(match) ? 0.45 : 0;
  if (strategy.id === 'market_consensus_sources') {
    if (externalPredictionStrength >= 3) return 1.25 + knockoutBonus;
    if (externalPredictionStrength >= 1) return 0.75 + knockoutBonus / 2;
    return 0.28;
  }
  if (strategy.id === 'draw_anchor_3') {
    return market.drawLean ? 0.8 : 0.15;
  }
  if (strategy.id === 'low_score_basket_4') {
    return market.lowScoreLean && !market.heavyFavorite ? 0.5 : 0.1;
  }
  if (strategy.id === 'balanced_outcomes_3') {
    return market.balancedOutcomes ? 0.9 : 0.15;
  }
  if (strategy.id === 'market_consensus_4') {
    return market.heavyFavorite ? 0.85 : 0.2;
  }
  if (strategy.id === 'favorite_narrow_win_3') {
    return market.heavyFavorite ? 0.75 : 0.1;
  }
  if (strategy.id === 'underdog_cover_3') {
    return market.heavyFavorite ? 0.25 : 0.35;
  }
  if (strategy.id === 'trend_risers_2') {
    return market.hasStrongPositiveTrend ? 1 : -0.1;
  }
  if (strategy.id === 'trend_fallers_2') {
    return market.hasStrongNegativeTrend ? 0.8 : -0.1;
  }
  if (strategy.id === 'lowest_odds_3') return 0.3;
  if (strategy.id === 'lowest_odds_2') return 0.2;
  if (strategy.id === 'low_score_dutch_3') return market.lowScoreLean && !market.heavyFavorite ? 0.55 : 0.1;
  if (strategy.id === 'favorite_six_cover') return market.heavyFavorite ? 0.95 : 0.05;
  if (strategy.id === 'favorite_draw_saver_4') return market.heavyFavorite ? 0.85 : 0.25;
  if (strategy.id === 'mid_odds_value_3') return market.hasHealthyMidOdds ? 0.85 : 0.05;
  if (strategy.id === 'market_poisson_ev') return market.hasCompleteScoreBoard ? 1.05 : 0.35;
  if (strategy.id === 'context_poisson_ev') return market.hasCompleteScoreBoard ? 0.65 : 0.2;
  if (strategy.id === 'context_poisson_ev_v2') return market.hasCompleteScoreBoard ? 0.7 : 0.2;
  if (strategy.id === 'context_poisson_ev_v3') return market.hasCompleteScoreBoard ? 0.75 : 0.2;
  if (strategy.id === 'tem_hybrid_draw_poisson_v2_d1_n2') return market.hasCompleteScoreBoard && market.drawLean ? 0.95 : 0.35;
  if (strategy.id === 'tem_draw_anchor_3_max5_5') return market.drawLean ? 1 : 0.2;
  return 0;
}

function getRouterCandidateStrategies(strategies, dynamicCandidateIds = []) {
  const byId = new Map((strategies || []).map((strategy) => [strategy.id, strategy]));
  return uniqueValues([...routerCandidateStrategyIds, ...dynamicCandidateIds])
    .map((strategyId) => byId.get(strategyId) || candidateStrategies.find((strategy) => strategy.id === strategyId))
    .filter(Boolean);
}

function getDynamicRouterCandidateIds({ strategies, rollingStats }) {
  const strategyIds = new Set((strategies || []).map((strategy) => strategy.id));

  return Object.values(rollingStats || {})
    .filter((stats) => isQualifiedDynamicCandidate({ stats, strategyIds }))
    .sort((a, b) => (
      b.roiPercent - a.roiPercent
      || b.netProfit - a.netProfit
      || b.hitMatches - a.hitMatches
      || a.strategyId.localeCompare(b.strategyId)
    ))
    .slice(0, dynamicRouterCandidateLimit)
    .map((stats) => stats.strategyId);
}

function isQualifiedDynamicCandidate({ stats, strategyIds }) {
  if (!stats || !strategyIds.has(stats.strategyId)) return false;
  if (routerCandidateStrategyIds.includes(stats.strategyId)) return false;
  if (stats.strategyId === fallbackStrategyId) return false;
  if (stats.settledMatches < dynamicCandidateMinSettledMatches) return false;
  if (stats.hitMatches < dynamicCandidateMinHitMatches) return false;
  if (stats.roiPercent < dynamicCandidateMinRoiPercent) return false;
  const averagePicks = stats.settledMatches > 0 ? stats.cost / stats.settledMatches : Number.POSITIVE_INFINITY;
  return averagePicks <= dynamicCandidateMaxAveragePicks;
}

function getMarketFeatures(odds) {
  const homeMin = minOddsForOutcome(odds, 'home');
  const drawMin = minOddsForOutcome(odds, 'draw');
  const awayMin = minOddsForOutcome(odds, 'away');
  const favoriteMin = Math.min(homeMin, awayMin);
  const underdogMin = Math.max(homeMin, awayMin);
  const topPositiveTrend = Math.max(...odds.map((pick) => pick.changePct ?? Number.NEGATIVE_INFINITY));
  const topNegativeTrend = Math.min(...odds.map((pick) => pick.changePct ?? Number.POSITIVE_INFINITY));

  return {
    homeMin,
    drawMin,
    awayMin,
    heavyFavorite: favoriteMin <= 5 && underdogMin >= 12,
    balancedOutcomes: Math.abs(homeMin - awayMin) <= 4 && drawMin <= 7,
    drawLean: drawMin <= 7 || odds.some((pick) => pick.score === '1-1' && pick.odds <= 7),
    lowScoreLean: ['0-0', '0-1', '1-0', '1-1'].every((score) => odds.some((pick) => pick.score === score)),
    hasStrongPositiveTrend: topPositiveTrend >= 20,
    hasStrongNegativeTrend: topNegativeTrend <= -15,
    hasHealthyMidOdds: odds.filter((pick) => pick.odds >= 8 && pick.odds <= 18).length >= 3,
    hasCompleteScoreBoard: odds.length >= 28,
  };
}

function describeMarket(odds) {
  const market = getMarketFeatures(odds);
  const parts = [
    `主胜最低 ${formatMetric(market.homeMin)}`,
    `平局最低 ${formatMetric(market.drawMin)}`,
    `客胜最低 ${formatMetric(market.awayMin)}`,
  ];
  if (market.heavyFavorite) parts.push('存在明显热门');
  if (market.balancedOutcomes) parts.push('胜平负相对均衡');
  if (market.drawLean) parts.push('平局锚点可用');
  if (market.hasStrongPositiveTrend) parts.push('有明显赔率上升项');
  if (market.hasCompleteScoreBoard) parts.push('比分盘完整');
  return parts.join('，');
}

function strategyCanPick(strategy, odds, match = null) {
  return uniqueScores(strategy.selectPicks({ odds, context: match?.strategyContext || {}, match }) || []).length > 0;
}

function findStrategy(strategies, strategyId) {
  return strategies.find((strategy) => strategy.id === strategyId)
    || candidateStrategies.find((strategy) => strategy.id === fallbackStrategyId);
}

function normalizeOdds(options) {
  return (options || [])
    .filter((option) => option.score && Number.isFinite(Number(option.odds)))
    .map((option) => ({
      score: option.score,
      odds: Number(option.odds),
      changePct: Number.isFinite(Number(option.trend?.changePct))
        ? Number(option.trend.changePct)
        : Number.isFinite(Number(option.changePct))
          ? Number(option.changePct)
          : null,
    }));
}

function uniqueScores(picks) {
  return [...new Set((picks || []).map((pick) => pick.score).filter(Boolean))];
}

function uniquePicks(picks) {
  const seen = new Set();
  const unique = [];
  for (const pick of picks || []) {
    const score = typeof pick === 'string' ? pick : pick?.score;
    if (!score || seen.has(score)) continue;
    seen.add(score);
    unique.push({
      score,
      ...(Number.isFinite(Number(pick?.odds)) ? { odds: Number(pick.odds) } : {}),
      ...(Number.isFinite(Number(pick?.probability)) ? { probability: Number(pick.probability) } : {}),
      ...(Number.isFinite(Number(pick?.ev)) ? { ev: Number(pick.ev) } : {}),
      ...(Number.isFinite(Number(pick?.sourceScore)) ? { sourceScore: Number(pick.sourceScore) } : {}),
      ...(pick?.reason ? { reason: pick.reason } : {}),
    });
  }
  return unique;
}

function normalizePickDetails(picks) {
  return (picks || [])
    .map((pick) => (typeof pick === 'string' ? { score: pick } : pick))
    .filter((pick) => pick?.score);
}

function formatProbabilityEvText(pick) {
  if (!Number.isFinite(Number(pick?.probability))) return '';
  const probability = Number(pick.probability);
  const ev = Number.isFinite(Number(pick?.ev)) ? Number(pick.ev) : null;
  const evText = ev === null ? '' : `，EV ${formatSignedMetric(ev)}`;
  return `预计概率 ${formatPercent(probability)}${evText}`;
}

function uniqueValues(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function formatPercent(value) {
  return `${formatMetric(Number(value) * 100)}%`;
}

function formatSignedMetric(value) {
  const formatted = formatMetric(value);
  return Number(value) > 0 ? `+${formatted}` : formatted;
}

function minOddsForOutcome(odds, outcome) {
  const values = odds.filter((pick) => getScoreOutcome(pick.score) === outcome).map((pick) => pick.odds);
  return values.length ? Math.min(...values) : Number.POSITIVE_INFINITY;
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

function buildDateTimeKey(date, time = '00:00') {
  return `${date || '0000-00-00'} ${time || '00:00'}`;
}

function emptyStats(strategyId) {
  return {
    strategyId,
    strategyName: findStrategy(candidateStrategies, strategyId).name,
    settledMatches: 0,
    cost: 0,
    revenue: 0,
    netProfit: 0,
    roiPercent: 0,
    hitMatches: 0,
  };
}

function isKnockoutMatch(match) {
  return /Round of|Quarterfinal|Semifinal|Final|Third-place/i.test(match?.stage || '');
}

function formatMatch(match) {
  return `${match.home} vs ${match.away}`;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundMetric(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatMetric(value) {
  if (value === Number.POSITIVE_INFINITY) return '无';
  const rounded = roundMetric(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}

function formatSignedPercent(value) {
  return `${Number(value) > 0 ? '+' : ''}${formatMetric(value)}%`;
}
