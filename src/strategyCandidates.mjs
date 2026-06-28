import { exactSportteryScores } from './scoreTemplate.mjs';
import {
  buildContextPoissonEvSelection,
  buildContextPoissonEvV2Selection,
  buildContextPoissonEvV3Selection,
  buildMarketPoissonEvSelection,
} from './poissonEvStrategy.mjs';
import { buildSourceConsensusSelection } from './sourceConsensusStrategy.mjs';

export const candidateStrategies = [
  {
    id: 'low_score_basket_4',
    name: '低比分篮子',
    description: '固定买 0-0、0-1、1-0、1-1，验证低比分基础盘。',
    selectPicks: ({ odds }) => pickFixedScores(odds, ['0-0', '0-1', '1-0', '1-1']),
  },
  {
    id: 'lowest_odds_2',
    name: '赔率最低两项',
    description: '买市场最认可的两个比分。',
    selectPicks: ({ odds }) => sortByOdds(odds).slice(0, 2),
  },
  {
    id: 'lowest_odds_3',
    name: '赔率最低三项',
    description: '在最低赔率基础上增加一个覆盖位。',
    selectPicks: ({ odds }) => sortByOdds(odds).slice(0, 3),
  },
  {
    id: 'market_consensus_4',
    name: '市场共识四项',
    description: '买最低赔率四项，但限制过高赔率噪音。',
    selectPicks: ({ odds }) => sortByOdds(odds).filter((pick) => pick.odds <= 18).slice(0, 4),
  },
  {
    id: 'tem_consensus_n3_cap7',
    name: '市场共识 3 格',
    family: 'market_consensus',
    style: 'balanced',
    parameters: { maxPicks: 3, maxOdds: 7 },
    description: '共识型 v3：选择赔率最低且不高于 7 的 3 个比分，优先控制成本和赔率噪音。',
    explanation: '把最低赔率视作市场共识，限制过高赔率噪音。',
    selectPicks: ({ odds }) => sortByOdds(odds).filter((pick) => pick.odds <= 7).slice(0, 3),
  },
  {
    id: 'tem_source_consensus_poisson_context_v1_s2_c3_n3_cap6',
    name: '来源低赔泊松 3 格',
    family: 'market_consensus',
    style: 'attack',
    parameters: {
      sourceFirst: true,
      poissonVariant: 'context_v1',
      sourceCount: 2,
      consensusCount: 3,
      maxPicks: 3,
      maxConsensusOdds: 6,
      maxSourceOdds: 30,
    },
    description: '共识型 v5：先取外部来源明确比分和 6 倍内低赔共识，再用赛前泊松 EV 补足到 3 格。',
    explanation: '把机构/媒体明确比分、市场低赔和泊松 EV 三层信号合并，同时控制成本与候选密度。',
    selectPicks: ({ odds, context }) => pickSourceConsensusPoissonContextV1(odds, context),
  },
  {
    id: 'market_consensus_sources',
    name: '市场来源共识',
    family: 'market_consensus',
    style: 'balanced',
    parameters: { sourceFirst: true },
    description: '综合机构明确比分、方向型预测和比分赔率低位，优先给出可解释的市场主线比分。',
    explanation: '优先采纳机构明确比分，再用方向预测和赔率低位补足。',
    selectPicks: ({ odds, context }) => buildSourceConsensusSelection({ odds, context }).picks,
  },
  {
    id: 'favorite_narrow_win_3',
    name: '热门小胜',
    description: '按低赔率判断热门方向，优先买热门方一球/两球小胜。',
    selectPicks: ({ odds }) => pickFavoriteNarrowWin(odds),
  },
  {
    id: 'draw_anchor_3',
    name: '平局锚点',
    description: '以 1-1 为核心，覆盖 0-0 和 2-2。',
    selectPicks: ({ odds }) => pickFixedScores(odds, ['1-1', '0-0', '2-2']),
  },
  {
    id: 'underdog_cover_3',
    name: '弱势方偷分',
    description: '判断市场弱势方，覆盖弱势方小胜和平局。',
    selectPicks: ({ odds }) => pickUnderdogCover(odds),
  },
  {
    id: 'trend_risers_2',
    name: '赔率上升两项',
    description: '买赔率涨幅最大的两个比分，观察市场漂移后的回报。',
    selectPicks: ({ odds }) => sortByTrend(odds, 'desc').filter((pick) => pick.changePct > 0).slice(0, 2),
  },
  {
    id: 'trend_fallers_2',
    name: '赔率下降两项',
    description: '买赔率跌幅最大的两个比分，跟随市场压低的结果。',
    selectPicks: ({ odds }) => sortByTrend(odds, 'asc').filter((pick) => pick.changePct < 0).slice(0, 2),
  },
  {
    id: 'balanced_outcomes_3',
    name: '胜平负均衡',
    description: '分别选主胜、平局、客胜里赔率最低的一项，避免单方向暴露。',
    selectPicks: ({ odds }) => pickBalancedOutcomes(odds),
  },
  {
    id: 'low_score_dutch_3',
    name: '低比分三角',
    description: '参考 correct score dutching 常见思路，覆盖 0-0、1-0、0-1 三个低比分入口。',
    selectPicks: ({ odds }) => pickFixedScores(odds, ['0-0', '1-0', '0-1']),
  },
  {
    id: 'favorite_six_cover',
    name: '热门六码包围',
    description: '强弱分明时覆盖热门方 1-0、2-0、2-1、3-0、3-1、3-2 方向。',
    selectPicks: ({ odds }) => pickFavoriteSixCover(odds),
  },
  {
    id: 'favorite_draw_saver_4',
    name: '热门平局保护',
    description: '热门方小胜为主，同时保留 1-1 作为平局保护。',
    selectPicks: ({ odds }) => pickFavoriteDrawSaver(odds),
  },
  {
    id: 'mid_odds_value_3',
    name: '中赔率价值带',
    description: '避开最低赔和超高赔，选择 8-18 区间内市场仍认可的三个比分。',
    selectPicks: ({ odds }) => sortByOdds(odds.filter((pick) => pick.odds >= 8 && pick.odds <= 18)).slice(0, 3),
  },
  {
    id: 'market_poisson_ev',
    name: '市场泊松EV',
    description: '用比分赔率拟合 Poisson/Dixon-Coles 分布，再买模型概率乘赔率后的最高 EV 比分。',
    selectPicks: ({ odds, context }) => buildMarketPoissonEvSelection({ odds, context }).picks,
  },
  {
    id: 'context_poisson_ev',
    name: '赛前泊松EV',
    description: '用赛前 context 独立估计双方期望进球，再与赔率比较选择最高 EV 比分。',
    selectPicks: ({ odds, context }) => buildContextPoissonEvSelection({ odds, context }).picks,
  },
  {
    id: 'context_poisson_ev_v2',
    name: '赛前泊松EV精选',
    family: 'poisson_ev',
    style: 'selected',
    parameters: { variant: 'context_v2', maxPicks: 2 },
    description: '赛前泊松EV的精选版本，提高概率门槛并限制最多 2 个比分，优先减少低置信噪音。',
    explanation: '用赛前 context 估计双方进球，再按 EV 精选少量比分。',
    selectPicks: ({ odds, context }) => buildContextPoissonEvV2Selection({ odds, context }).picks,
  },
  {
    id: 'tem_poisson_drawguard_context_v3_n2_draw7_5_cap35_p0_006',
    name: '赛前泊松EV平局保护',
    family: 'poisson_ev',
    style: 'selected',
    parameters: {
      variant: 'context_v3',
      basePicks: 2,
      maxSelectableOdds: 35,
      minSelectableProbability: 0.006,
      diversity: 'outcome',
      drawGuardScore: '1-1',
      drawMaxOdds: 7.5,
    },
    description: '价值型 v6：用赛前泊松均衡模型生成多样性 EV 候选；若 1-1 赔率不高于 7.5，加入 1-1 平局保护。',
    explanation: '保留概率*赔率的 EV 解释，同时用低赔 1-1 保护接近比赛，提高命中和可读性。',
    selectPicks: ({ odds, context }) => pickPoissonDrawGuardContextV3(odds, context),
  },
  {
    id: 'context_poisson_ev_v3',
    name: '赛前泊松EV均衡',
    description: '赛前泊松EV的均衡覆盖版本，加入平局和低比分修正，保留更多候选以提高信息量。',
    selectPicks: ({ odds, context }) => buildContextPoissonEvV3Selection({ odds, context }).picks,
  },
  {
    id: 'tem_hybrid_draw_poisson_v2_d1_n2',
    name: '平局泊松混合 2 格',
    description: 'final3 精选型：先保留 1-1，再用赛前泊松EV精选补足到 2 个比分。',
    selectPicks: ({ odds, context }) => pickHybridDrawPoissonV2(odds, context),
  },
  {
    id: 'tem_draw_anchor_3_max5_5',
    name: '平局锚点 4 格',
    family: 'draw_anchor',
    style: 'balanced',
    parameters: { scores: ['1-1', '2-2', '0-0', '1-0'], drawMaxOdds: 5.5 },
    description: 'final3 均衡型：平局赔率较低时覆盖 1-1、2-2、0-0、1-0，否则回落到低平局三格。',
    explanation: '用平局低赔判断比赛接近程度，再围绕低比分平局和一个小胜保护。',
    selectPicks: ({ odds }) => pickFinalDrawAnchor(odds),
  },
  {
    id: 'tem_draw_anchor_lean_homeaway2_draw5_5_cap25',
    name: '平局锚点省注',
    family: 'draw_anchor',
    style: 'balanced',
    parameters: {
      baseScores: ['1-1', '0-0'],
      drawMaxOdds: 5.5,
      maxPickOdds: 25,
      extraMode: 'homeAwayLow2',
    },
    description: '稳定型 v4：固定保留 1-1/0-0；平局低于 5.5 时加入两个最低赔非平局比分，并过滤 25 以上长尾。',
    explanation: '减少 2-2 等成本项，用市场最低的非平局比分做小胜保护，保持低比分底座。',
    selectPicks: ({ odds }) => pickLeanDrawAnchorHomeAway2(odds),
  },
];

export function runCandidateStrategyBacktests({
  matches,
  scoreOddsByMatch,
  strategies = candidateStrategies,
}) {
  return strategies.map((strategy) => runOneStrategy({
    strategy,
    matches,
    scoreOddsByMatch,
  }));
}

export function formatCandidateStrategySummary(results) {
  const sorted = [...(results || [])].sort((a, b) => b.roiPercent - a.roiPercent || b.netProfit - a.netProfit);
  const lines = [
    '候选策略回测',
    '口径：每个比分 1 注；命中返还=该比分赔率；ROI=(返还-成本)/成本。',
    '',
    '| 策略 | 场次 | 成本 | 返还 | 净收益 | ROI | 命中 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const result of sorted) {
    lines.push([
      `| ${result.strategyId}`,
      result.settledMatches,
      formatMetric(result.cost),
      formatMetric(result.revenue),
      formatSigned(result.netProfit),
      `${formatSigned(result.roiPercent)}%`,
      `${result.hitMatches}/${result.settledMatches} |`,
    ].join(' | '));
  }

  return lines.join('\n');
}

function runOneStrategy({ strategy, matches, scoreOddsByMatch }) {
  const rows = [];

  for (const match of matches || []) {
    if (!isCompletedMatch(match)) continue;
    const odds = normalizeOdds(scoreOddsByMatch?.[match.id]);
    const picks = uniquePicks(strategy.selectPicks({ match, odds, context: match.strategyContext || {} }) || []);
    if (!picks.length) continue;

    rows.push(buildSettledRow({ match, picks }));
  }

  const cost = roundMetric(sum(rows.map((row) => row.cost)));
  const revenue = roundMetric(sum(rows.map((row) => row.revenue)));
  const netProfit = roundMetric(revenue - cost);

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    description: strategy.description,
    settledMatches: rows.length,
    cost,
    revenue,
    netProfit,
    roiPercent: cost > 0 ? roundMetric((netProfit / cost) * 100) : 0,
    hitMatches: rows.filter((row) => row.hitScore).length,
    rows,
  };
}

function normalizeOdds(options) {
  return (options || [])
    .filter((option) => option.score && Number.isFinite(Number(option.odds)))
    .map((option) => ({
      score: option.score,
      odds: Number(option.odds),
      changePct: Number.isFinite(Number(option.trend?.changePct))
        ? Number(option.trend.changePct)
        : null,
    }));
}

function buildSettledRow({ match, picks }) {
  const actualScore = `${match.homeScore}-${match.awayScore}`;
  const hit = picks.find((pick) => isWinningScoreLabel(match, pick.score));
  const cost = picks.length;
  const revenue = hit ? hit.odds : 0;

  return {
    matchId: match.id,
    date: match.date,
    time: match.time,
    match: `${match.home} vs ${match.away}`,
    actualScore,
    picks,
    hitScore: hit?.score || '',
    hitOdds: hit?.odds || 0,
    cost,
    revenue,
    netProfit: roundMetric(revenue - cost),
  };
}

function pickFixedScores(odds, scores) {
  const oddsByScore = new Map(odds.map((option) => [option.score, option]));
  return scores.filter((score) => oddsByScore.has(score)).map((score) => oddsByScore.get(score));
}

function pickSourceConsensusPoissonContextV1(odds, context) {
  return uniquePicks([
    ...buildSourceConsensusSelection({
      odds,
      context,
      maxPicks: 3,
    }).picks.filter((pick) => pick.odds <= 30 || String(pick.reason || '').includes('明确')).slice(0, 2),
    ...sortByOdds(odds).filter((pick) => pick.odds <= 6).slice(0, 3),
    ...buildContextPoissonEvSelection({
      odds,
      context,
      options: {
        maxPicks: 3,
        minPicks: 2,
        maxSelectableOdds: 35,
        minSelectableProbability: 0.006,
      },
    }).picks,
  ]).slice(0, 3);
}

function pickConsensusPoissonContextV1(odds, context) {
  return uniquePicks([
    ...sortByOdds(odds).filter((pick) => pick.odds <= 7).slice(0, 1),
    ...buildContextPoissonEvSelection({
      odds,
      context,
      options: {
        maxPicks: 4,
        minPicks: 2,
        maxSelectableOdds: 35,
        minSelectableProbability: 0.006,
      },
    }).picks,
  ]).slice(0, 4);
}

function pickLeanDrawAnchorHomeAway2(odds) {
  const base = pickFixedScores(odds, ['1-1', '0-0'])
    .filter((pick) => pick.odds <= 25);
  if (minOddsForOutcome(odds, 'draw') > 5.5) return base;
  const nonDraw = sortByOdds(odds)
    .filter((pick) => getScoreOutcome(pick.score) !== 'draw' && pick.odds <= 25)
    .slice(0, 2);
  return uniquePicks([...base, ...nonDraw]);
}

function pickPoissonDrawGuardContextV3(odds, context) {
  const base = pickDiversePoissonEv({
    odds,
    context,
    builder: buildContextPoissonEvV3Selection,
    maxPicks: 2,
    maxSelectableOdds: 35,
    minSelectableProbability: 0.006,
  });
  const modelSelection = buildContextPoissonEvV3Selection({
    odds,
    context,
    options: {
      maxPicks: 12,
      minPicks: 2,
      maxSelectableOdds: 35,
      minSelectableProbability: 0.006,
    },
  });
  const oddsOneOne = odds.find((pick) => pick.score === '1-1' && pick.odds <= 7.5);
  const modelOneOne = modelSelection.evTable?.find((pick) => pick.score === '1-1');
  return uniquePicks([
    ...(oddsOneOne ? [modelOneOne || oddsOneOne] : []),
    ...base,
  ]).slice(0, oddsOneOne ? 3 : 2);
}

function pickDiversePoissonEv({
  odds,
  context,
  builder,
  maxPicks,
  maxSelectableOdds,
  minSelectableProbability,
}) {
  const pool = builder({
    odds,
    context,
    options: {
      maxPicks: Math.max(maxPicks * 3, 8),
      minPicks: Math.min(2, maxPicks),
      maxSelectableOdds,
      minSelectableProbability,
    },
  }).picks;
  const selected = [];
  const usedOutcomes = new Set();
  for (const pick of pool) {
    const outcome = getScoreOutcome(pick.score);
    if (usedOutcomes.has(outcome)) continue;
    selected.push(pick);
    usedOutcomes.add(outcome);
    if (selected.length >= maxPicks) return selected;
  }
  return uniquePicks(pool).slice(0, maxPicks);
}

function pickFavoriteNarrowWin(odds) {
  const strength = getOutcomeStrength(odds);
  if (strength.home < strength.away) {
    return pickFixedScores(odds, ['1-0', '2-1', '2-0']);
  }
  if (strength.away < strength.home) {
    return pickFixedScores(odds, ['0-1', '1-2', '0-2']);
  }
  return pickFixedScores(odds, ['1-1', '1-0', '0-1']);
}

function pickUnderdogCover(odds) {
  const strength = getOutcomeStrength(odds);
  if (strength.home < strength.away) {
    return pickFixedScores(odds, ['0-1', '1-1', '1-2']);
  }
  if (strength.away < strength.home) {
    return pickFixedScores(odds, ['1-0', '1-1', '2-1']);
  }
  return pickFixedScores(odds, ['0-0', '1-1', '2-2']);
}

function pickBalancedOutcomes(odds) {
  return [
    sortByOdds(odds.filter((pick) => getScoreOutcome(pick.score) === 'home'))[0],
    sortByOdds(odds.filter((pick) => getScoreOutcome(pick.score) === 'draw'))[0],
    sortByOdds(odds.filter((pick) => getScoreOutcome(pick.score) === 'away'))[0],
  ].filter(Boolean);
}

function pickFavoriteSixCover(odds) {
  const strength = getOutcomeStrength(odds);
  if (strength.home < strength.away) {
    return pickFixedScores(odds, ['1-0', '2-0', '2-1', '3-0', '3-1', '3-2']);
  }
  if (strength.away < strength.home) {
    return pickFixedScores(odds, ['0-1', '0-2', '1-2', '0-3', '1-3', '2-3']);
  }
  return pickBalancedOutcomes(odds);
}

function pickFavoriteDrawSaver(odds) {
  const strength = getOutcomeStrength(odds);
  if (strength.home < strength.away) {
    return pickFixedScores(odds, ['1-0', '2-0', '2-1', '1-1']);
  }
  if (strength.away < strength.home) {
    return pickFixedScores(odds, ['0-1', '0-2', '1-2', '1-1']);
  }
  return pickFixedScores(odds, ['0-0', '1-1', '2-2']);
}

function pickHybridDrawPoissonV2(odds, context) {
  return uniquePicks([
    ...pickFixedScores(odds, ['1-1']),
    ...buildContextPoissonEvV2Selection({
      odds,
      context,
      options: {
        maxPicks: 2,
        minPicks: 1,
      },
    }).picks,
  ]).slice(0, 2);
}

function pickFinalDrawAnchor(odds) {
  const drawMin = minOddsForOutcome(odds, 'draw');
  const scores = drawMin <= 5.5
    ? ['1-1', '2-2', '0-0', '1-0']
    : ['1-1', '0-0', '2-2'];
  return pickFixedScores(odds, scores);
}

function pickFinalDrawAnchorCapped(odds) {
  const drawMin = minOddsForOutcome(odds, 'draw');
  const scores = drawMin <= 5.5
    ? ['1-1', '0-0', '2-2', '1-0']
    : ['1-1', '0-0', '2-2'];
  return pickFixedScores(odds, scores).filter((pick) => pick.odds <= 35);
}

function getOutcomeStrength(odds) {
  return {
    home: minOddsForOutcome(odds, 'home'),
    draw: minOddsForOutcome(odds, 'draw'),
    away: minOddsForOutcome(odds, 'away'),
  };
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

function sortByOdds(odds) {
  return [...odds].sort((a, b) => a.odds - b.odds || a.score.localeCompare(b.score));
}

function sortByTrend(odds, direction) {
  const sign = direction === 'asc' ? 1 : -1;
  return [...odds]
    .filter((pick) => pick.changePct !== null)
    .sort((a, b) => sign * (a.changePct - b.changePct) || a.odds - b.odds || a.score.localeCompare(b.score));
}

function uniquePicks(picks) {
  const seen = new Set();
  const unique = [];
  for (const pick of picks) {
    if (!pick?.score || seen.has(pick.score)) continue;
    seen.add(pick.score);
    unique.push({
      score: pick.score,
      odds: pick.odds,
      ...(pick.changePct !== null ? { changePct: pick.changePct } : {}),
      ...(Number.isFinite(Number(pick.probability)) ? { probability: pick.probability } : {}),
      ...(Number.isFinite(Number(pick.ev)) ? { ev: pick.ev } : {}),
      ...(Number.isFinite(Number(pick.sourceScore)) ? { sourceScore: pick.sourceScore } : {}),
      ...(pick.reason ? { reason: pick.reason } : {}),
    });
  }
  return unique;
}

function isCompletedMatch(match) {
  return match.status === 'post'
    && Number.isInteger(match.homeScore)
    && Number.isInteger(match.awayScore);
}

function isWinningScoreLabel(match, score) {
  const actualScore = `${match.homeScore}-${match.awayScore}`;
  if (score === actualScore) return true;
  if (exactSportteryScores.has(actualScore)) return false;

  if (match.homeScore > match.awayScore) return score === '胜其他';
  if (match.homeScore === match.awayScore) return score === '平其他';
  return score === '负其他';
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function roundMetric(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMetric(value) {
  const rounded = roundMetric(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}

function formatSigned(value) {
  const formatted = formatMetric(value);
  return value > 0 ? `+${formatted}` : formatted;
}
