import { defaultAiPredictionScores } from './aiPredictionBatch.mjs';
import { candidateStrategies } from './strategyCandidates.mjs';

const fallbackStrategyId = 'low_score_basket_4';
export const routerCandidateStrategyIds = [
  'tem_hybrid_draw_poisson_v2_d1_n2',
  'tem_draw_anchor_3_max5_5',
  'context_poisson_ev_v3',
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
  const routerStrategies = getRouterCandidateStrategies(strategies);
  const odds = normalizeOdds(scoreOptions);
  const rollingStats = buildRollingStrategyStats({
    historicalResults,
    cutoffDate: match.date,
    cutoffTime: match.time,
  });

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
      featureScore: scoreStrategyFeatures({ strategy, odds }),
    }))
    .filter((item) => strategyCanPick(item.strategy, odds))
    .map((item) => ({
      ...item,
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
      const picks = pickScoresForRoute({ route, scoreOptions, strategies, match });
      return {
        matchId: match.id,
        scores: picks,
        route,
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
      return {
        matchId: match.id,
        scores: pickScoresForRoute({ route, scoreOptions, strategies, match }),
        route,
      };
    });
}

export function pickScoresForRoute({ route, scoreOptions, strategies = candidateStrategies, match = null }) {
  if (route.strategyId === fallbackStrategyId && !normalizeOdds(scoreOptions).length) {
    return defaultAiPredictionScores;
  }

  const strategy = findStrategy(strategies, route.strategyId);
  const picks = uniqueScores(strategy.selectPicks({
    match,
    odds: normalizeOdds(scoreOptions),
    context: match?.strategyContext || {},
  }) || []);
  return picks.length ? picks : defaultAiPredictionScores;
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
  return [
    `${formatMatch(match)}：router 选择「${selected.strategy.name}」。`,
    `滚动历史 ROI ${formatSignedPercent(selected.stats.roiPercent)}，样本 ${selected.stats.settledMatches} 场。`,
    `当前盘口特征：${market}。`,
    `综合分=${formatMetric(selected.routerScore)}，其中历史表现和策略适配度共同参与排序。`,
  ].join('');
}

function scoreStrategyFeatures({ strategy, odds }) {
  const market = getMarketFeatures(odds);
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

function getRouterCandidateStrategies(strategies) {
  const byId = new Map((strategies || []).map((strategy) => [strategy.id, strategy]));
  return routerCandidateStrategyIds
    .map((strategyId) => byId.get(strategyId) || candidateStrategies.find((strategy) => strategy.id === strategyId))
    .filter(Boolean);
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

function strategyCanPick(strategy, odds) {
  return uniqueScores(strategy.selectPicks({ odds }) || []).length > 0;
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
