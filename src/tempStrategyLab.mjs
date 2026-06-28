import {
  buildContextPoissonEvSelection,
  buildContextPoissonEvV2Selection,
  buildContextPoissonEvV3Selection,
} from './poissonEvStrategy.mjs';
import { buildSourceConsensusSelection } from './sourceConsensusStrategy.mjs';

export const defaultQualificationGate = {
  minRoiPercent: 5,
  minSettledMatches: 35,
  minHitMatches: 4,
  minAvgPicks: 1.5,
  maxAvgPicks: 5,
  maxPicks: 6,
};

export function generateTempStrategyCandidates({ maxCandidates = 200 } = {}) {
  const strategies = [];
  const add = (definition) => {
    strategies.push({
      ...definition,
      id: `tem_${definition.id}`,
      name: definition.name,
      description: definition.description,
      selectPicks: definition.selectPicks,
    });
  };

  addScoreBasketStrategies(add);
  addConsensusStrategies(add);
  addDrawAnchorStrategies(add);
  addOutcomeBalanceStrategies(add);
  addHybridStrategies(add);
  addFavoriteCoverStrategies(add);
  addUnderdogProtectionStrategies(add);
  addMidValueStrategies(add);
  addPoissonEvStrategies(add);
  addTrendStrategies(add);

  return selectBalancedStrategyCandidates(strategies, maxCandidates);
}

export function enrichBacktestResult(result, gate = defaultQualificationGate, metadata = {}) {
  const rows = result.rows || [];
  const pickCounts = rows.map((row) => row.picks?.length || 0);
  const avgPicks = pickCounts.length ? roundMetric(sum(pickCounts) / pickCounts.length) : 0;
  const maxPicks = pickCounts.length ? Math.max(...pickCounts) : 0;
  const minPicks = pickCounts.length ? Math.min(...pickCounts) : 0;
  const hitRatePercent = result.settledMatches > 0
    ? roundMetric((result.hitMatches / result.settledMatches) * 100)
    : 0;
  const selectionSignature = buildSelectionSignature(rows);
  const failedGateReasons = getFailedGateReasons({
    ...result,
    avgPicks,
    maxPicks,
  }, gate);

  return {
    ...result,
    family: result.family || metadata.family || 'unknown',
    style: result.style || metadata.style || 'unknown',
    parameters: result.parameters || metadata.parameters || {},
    explanation: result.explanation || metadata.explanation || result.description || '',
    avgPicks,
    minPicks,
    maxPicks,
    selectionSignature,
    hitRatePercent,
    qualified: failedGateReasons.length === 0,
    failedGateReasons,
  };
}

export function selectQualifiedTopStrategies(results, {
  limit = 10,
  gate = defaultQualificationGate,
  maxPerFamily = 2,
} = {}) {
  const qualified = results
    .map((result) => result.failedGateReasons ? result : enrichBacktestResult(result, gate))
    .filter((result) => result.qualified)
    .sort(sortStrategyResults);

  const selected = [];
  const familyCounts = new Map();
  const seenSignatures = new Set();
  for (const result of qualified) {
    const count = familyCounts.get(result.family) || 0;
    if (count >= maxPerFamily) continue;
    if (seenSignatures.has(result.selectionSignature)) continue;
    selected.push(result);
    seenSignatures.add(result.selectionSignature);
    familyCounts.set(result.family, count + 1);
    if (selected.length >= limit) return selected;
  }

  const qualifiedFamilies = new Set(qualified.map((result) => result.family)).size || 1;
  const relaxedMaxPerFamily = Math.max(maxPerFamily, Math.ceil(limit / qualifiedFamilies));
  for (const result of qualified) {
    if (selected.some((item) => item.strategyId === result.strategyId)) continue;
    if (seenSignatures.has(result.selectionSignature)) continue;
    const count = familyCounts.get(result.family) || 0;
    if (count >= relaxedMaxPerFamily) continue;
    selected.push(result);
    seenSignatures.add(result.selectionSignature);
    familyCounts.set(result.family, count + 1);
    if (selected.length >= limit) break;
  }

  for (const result of qualified) {
    if (selected.length >= limit) break;
    if (selected.some((item) => item.strategyId === result.strategyId)) continue;
    if (seenSignatures.has(result.selectionSignature)) continue;
    selected.push(result);
    seenSignatures.add(result.selectionSignature);
  }

  return selected;
}

export function selectFinalThreeStrategies(results) {
  const selected = [];
  const profiles = [
    {
      finalProfile: '精选型',
      accepts: (result) => result.style === 'selected' || result.avgPicks <= 2.5,
      reason: '下注少、成本低，适合作为高置信推荐入口。',
      familyPreference: ['hybrid', 'poisson_ev', 'draw_anchor'],
    },
    {
      finalProfile: '均衡型',
      accepts: (result) => result.style === 'balanced' || (result.avgPicks >= 2.5 && result.avgPicks <= 4),
      reason: 'ROI、命中和可读性较均衡，适合作为默认推荐骨架。',
      familyPreference: ['draw_anchor', 'hybrid', 'score_basket', 'poisson_ev'],
    },
    {
      finalProfile: '进攻型',
      accepts: (result) => result.style === 'attack' || result.avgPicks >= 3.5,
      reason: '覆盖更有想象力的赔率区间或分歧场景，接受更高波动。',
      familyPreference: ['poisson_ev', 'hybrid', 'mid_value', 'trend'],
    },
  ];

  for (const profile of profiles) {
    const found = [...results]
      .filter((result) => !selected.some((item) => item.strategyId === result.strategyId))
      .filter((result) => profile.accepts(result))
      .sort((a, b) => scoreFinalProfile(b, profile, selected) - scoreFinalProfile(a, profile, selected) || sortStrategyResults(a, b))[0]
      || [...results]
        .filter((result) => !selected.some((item) => item.strategyId === result.strategyId))
        .sort(sortStrategyResults)[0];
    if (!found) continue;
    selected.push({
      ...found,
      finalProfile: profile.finalProfile,
      finalReason: profile.reason,
    });
  }

  return selected;
}

function scoreFinalProfile(result, profile, selected) {
  const familyIndex = profile.familyPreference.indexOf(result.family);
  const familyBonus = familyIndex >= 0 ? (profile.familyPreference.length - familyIndex) * 8 : 0;
  const diversityBonus = selected.some((item) => item.family === result.family) ? -18 : 8;
  const sourceBonus = result.source === 'production_router_pool' && result.family === 'poisson_ev' ? 4 : 0;
  return result.roiPercent + familyBonus + diversityBonus + sourceBonus + (result.hitRatePercent / 20);
}

export function serializeStrategyDefinition(strategy) {
  return {
    id: strategy.id,
    name: strategy.name,
    family: strategy.family,
    style: strategy.style,
    description: strategy.description,
    explanation: strategy.explanation,
    parameters: strategy.parameters,
  };
}

function addScoreBasketStrategies(add) {
  const baskets = [
    { key: 'classic_low4', scores: ['0-0', '0-1', '1-0', '1-1'], style: 'balanced', name: '经典低比分四格' },
    { key: 'low3', scores: ['0-0', '1-0', '0-1'], style: 'selected', name: '低比分三角' },
    { key: 'draw_low3', scores: ['0-0', '1-1', '2-2'], style: 'balanced', name: '低平局三格' },
    { key: 'home_small4', scores: ['1-0', '2-0', '2-1', '1-1'], style: 'balanced', name: '主队小胜保护' },
    { key: 'away_small4', scores: ['0-1', '0-2', '1-2', '1-1'], style: 'balanced', name: '客队小胜保护' },
    { key: 'one_goal5', scores: ['1-0', '0-1', '2-1', '1-2', '1-1'], style: 'attack', name: '一球胜负扩展' },
    { key: 'home_attack5', scores: ['1-0', '2-0', '2-1', '3-1', '3-2'], style: 'attack', name: '主队进攻包' },
    { key: 'away_attack5', scores: ['0-1', '0-2', '1-2', '1-3', '2-3'], style: 'attack', name: '客队进攻包' },
  ];

  for (const basket of baskets) {
    add({
      id: `basket_${basket.key}`,
      name: basket.name,
      family: 'score_basket',
      style: basket.style,
      parameters: { scores: basket.scores },
      description: `固定覆盖 ${basket.scores.join('、')}。`,
      explanation: '用固定比分篮子测试低比分、平局和小胜的基础形态。',
      selectPicks: ({ odds }) => pickFixedScores(odds, basket.scores),
    });
  }
}

function selectBalancedStrategyCandidates(strategies, maxCandidates) {
  if (!Number.isFinite(Number(maxCandidates)) || maxCandidates <= 0 || strategies.length <= maxCandidates) {
    return strategies;
  }

  const byFamily = new Map();
  for (const strategy of strategies) {
    const family = strategy.family || 'unknown';
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family).push(strategy);
  }

  const selected = [];
  const familyQueues = [...byFamily.values()];
  while (selected.length < maxCandidates && familyQueues.some((queue) => queue.length)) {
    for (const queue of familyQueues) {
      if (!queue.length) continue;
      selected.push(queue.shift());
      if (selected.length >= maxCandidates) break;
    }
  }
  return selected;
}

function addConsensusStrategies(add) {
  for (const maxPicks of [2, 3, 4, 5]) {
    for (const maxOdds of [7, 8, 10, 12, 15, 18, 25]) {
      add({
        id: `consensus_n${maxPicks}_cap${maxOdds}`,
        name: `市场共识 ${maxPicks} 格`,
        family: 'market_consensus',
        style: maxPicks <= 2 ? 'selected' : 'balanced',
        parameters: { maxPicks, maxOdds },
        description: `选择赔率最低且不高于 ${maxOdds} 的 ${maxPicks} 个比分。`,
        explanation: '把最低赔率视作市场共识，限制过高赔率噪音。',
        selectPicks: ({ odds }) => sortByOdds(odds).filter((pick) => pick.odds <= maxOdds).slice(0, maxPicks),
      });
    }
  }

  const poissonBuilders = [
    { key: 'context_v1', builder: buildContextPoissonEvSelection },
    { key: 'context_v3', builder: buildContextPoissonEvV3Selection },
  ];
  for (const poisson of poissonBuilders) {
    for (const consensusCount of [1, 2]) {
      for (const maxPicks of [3, 4]) {
        for (const maxConsensusOdds of [7, 8, 10]) {
          add({
            id: `consensus_poisson_${poisson.key}_c${consensusCount}_n${maxPicks}_cap${maxConsensusOdds}`,
            name: `共识泊松 ${maxPicks} 格`,
            family: 'market_consensus',
            style: maxPicks <= 3 ? 'balanced' : 'attack',
            parameters: {
              poissonVariant: poisson.key,
              consensusCount,
              maxPicks,
              maxConsensusOdds,
            },
            description: `先取 ${consensusCount} 个不高于 ${maxConsensusOdds} 的最低赔比分，再用泊松 EV 补足。`,
            explanation: '把市场共识作为锚点，再用赛前泊松 EV 增加可解释的补充比分。',
            selectPicks: ({ odds, context }) => uniquePicks([
              ...sortByOdds(odds).filter((pick) => pick.odds <= maxConsensusOdds).slice(0, consensusCount),
              ...poisson.builder({
                odds,
                context,
                options: {
                  maxPicks,
                  minPicks: 2,
                  maxSelectableOdds: 35,
                  minSelectableProbability: 0.006,
                },
              }).picks,
            ]).slice(0, maxPicks),
          });
        }
      }
    }
  }

  for (const poisson of poissonBuilders) {
    for (const sourceCount of [1, 2]) {
      for (const maxPicks of [3, 4]) {
        for (const maxSourceOdds of [7, 10, 15]) {
          add({
            id: `source_consensus_poisson_${poisson.key}_s${sourceCount}_n${maxPicks}_cap${maxSourceOdds}`,
            name: `来源共识泊松 ${maxPicks} 格`,
            family: 'market_consensus',
            style: maxPicks <= 3 ? 'balanced' : 'attack',
            parameters: {
              sourceFirst: true,
              poissonVariant: poisson.key,
              sourceCount,
              maxPicks,
              maxSourceOdds,
            },
            description: `先取 ${sourceCount} 个外部来源/共识比分，再用泊松 EV 补足到 ${maxPicks} 个。`,
            explanation: '把赛前文章的明确比分或倾向放在前面，再用泊松 EV 做可解释补位。',
            selectPicks: ({ odds, context }) => pickSourceConsensusPoisson({
              odds,
              context,
              sourceCount,
              maxPicks,
              maxSourceOdds,
              poissonBuilder: poisson.builder,
            }),
          });
        }
      }
    }
  }
}

function addDrawAnchorStrategies(add) {
  const drawSets = [
    ['1-1', '0-0'],
    ['1-1', '0-0', '2-2'],
    ['1-1', '2-2', '0-0', '1-0'],
    ['1-1', '2-2', '0-0', '0-1'],
    ['1-1', '0-0', '2-2', '3-3'],
  ];
  for (const [index, scores] of drawSets.entries()) {
    for (const drawMaxOdds of [5.5, 6.5, 7.5, 9]) {
      add({
        id: `draw_anchor_${index + 1}_max${String(drawMaxOdds).replace('.', '_')}`,
        name: `平局锚点 ${scores.length} 格`,
        family: 'draw_anchor',
        style: scores.length <= 2 ? 'selected' : 'balanced',
        parameters: { scores, drawMaxOdds },
        description: `以 1-1 为核心，平局最低赔率不高于 ${drawMaxOdds} 时优先覆盖 ${scores.join('、')}。`,
        explanation: '用平局赔率判断比赛是否接近，再围绕 1-1 和低平局展开。',
        selectPicks: ({ odds }) => {
          const drawMin = minOddsForOutcome(odds, 'draw');
          const fallback = scores.includes('1-1') ? ['1-1', '0-0', '2-2'] : scores;
          return pickFixedScores(odds, drawMin <= drawMaxOdds ? scores : fallback.slice(0, Math.min(3, scores.length)));
        },
      });
    }
  }

  const cappedDrawSets = [
    ['1-1', '0-0', '2-2', '1-0'],
    ['1-1', '0-0', '2-2', '0-1'],
    ['1-1', '0-0', '2-2', '2-1'],
    ['1-1', '0-0', '2-2', '1-2'],
  ];
  for (const [index, scores] of cappedDrawSets.entries()) {
    for (const drawMaxOdds of [5.5, 6.5, 7.5]) {
      for (const maxPickOdds of [25, 35]) {
        add({
          id: `draw_anchor_capped_${index + 1}_draw${String(drawMaxOdds).replace('.', '_')}_cap${maxPickOdds}`,
          name: `平局锚点限赔 ${scores.length} 格`,
          family: 'draw_anchor',
          style: 'balanced',
          parameters: { scores, drawMaxOdds, maxPickOdds },
          description: `平局最低赔不高于 ${drawMaxOdds} 时覆盖 ${scores.join('、')}，但每项赔率不高于 ${maxPickOdds}。`,
          explanation: '保留平局结构锚点，同时限制超高赔尾部，避免靠一次长尾冲高评分。',
          selectPicks: ({ odds }) => {
            const drawMin = minOddsForOutcome(odds, 'draw');
            const activeScores = drawMin <= drawMaxOdds ? scores : scores.slice(0, 3);
            return pickFixedScores(odds, activeScores).filter((pick) => pick.odds <= maxPickOdds);
          },
        });
      }
    }
  }

  const adaptiveFourthSets = [
    { key: 'smallwin', home: '1-0', away: '0-1', balanced: '1-0' },
    { key: 'bttswin', home: '2-1', away: '1-2', balanced: '1-0' },
    { key: 'clean2', home: '2-0', away: '0-2', balanced: '0-1' },
  ];
  for (const fourth of adaptiveFourthSets) {
    for (const drawMaxOdds of [5.5, 6.5, 7.5]) {
      for (const favoriteGap of [1.5, 2.5]) {
        for (const maxPickOdds of [25, 35]) {
          add({
            id: `draw_anchor_adaptive_${fourth.key}_draw${String(drawMaxOdds).replace('.', '_')}_gap${String(favoriteGap).replace('.', '_')}_cap${maxPickOdds}`,
            name: '平局锚点自适应',
            family: 'draw_anchor',
            style: 'balanced',
            parameters: {
              scores: ['1-1', '0-0', '2-2'],
              homeFourth: fourth.home,
              awayFourth: fourth.away,
              balancedFourth: fourth.balanced,
              drawMaxOdds,
              favoriteGap,
              maxPickOdds,
            },
            description: `以低平局为锚点，第四格按热门方向切到 ${fourth.home}/${fourth.away}，赔率上限 ${maxPickOdds}。`,
            explanation: '保留 1-1/0-0/2-2 的稳定结构，但让非平局保护项跟随赛前强弱方向。',
            selectPicks: ({ odds }) => pickAdaptiveDrawAnchor({
              odds,
              drawMaxOdds,
              maxPickOdds,
              favoriteGap,
              homeFourth: fourth.home,
              awayFourth: fourth.away,
              balancedFourth: fourth.balanced,
            }),
          });
        }
      }
    }
  }
}

function addOutcomeBalanceStrategies(add) {
  for (const perOutcome of [1, 2]) {
    for (const maxOdds of [10, 15, 25]) {
      for (const includeDrawFirst of [true, false]) {
        add({
          id: `outcome_balance_o${perOutcome}_cap${maxOdds}_${includeDrawFirst ? 'drawfirst' : 'oddsfirst'}`,
          name: `胜平负均衡 ${perOutcome * 3} 格`,
          family: 'outcome_balance',
          style: perOutcome === 1 ? 'selected' : 'balanced',
          parameters: { perOutcome, maxOdds, includeDrawFirst },
          description: `每个赛果方向最多取 ${perOutcome} 个低赔率比分，赔率上限 ${maxOdds}。`,
          explanation: '不押单一方向，分别从主胜、平局、客胜中提取市场认可的比分。',
          selectPicks: ({ odds }) => pickOutcomeBalance({ odds, perOutcome, maxOdds, includeDrawFirst }),
        });
      }
    }
  }
}

function addHybridStrategies(add) {
  const drawSets = [
    ['1-1'],
    ['1-1', '0-0'],
    ['1-1', '0-0', '2-2'],
  ];
  const poissonBuilders = [
    { key: 'v2', builder: buildContextPoissonEvV2Selection, style: 'selected' },
    { key: 'v3', builder: buildContextPoissonEvV3Selection, style: 'balanced' },
  ];

  for (const [drawIndex, drawScores] of drawSets.entries()) {
    for (const poisson of poissonBuilders) {
      for (const maxPicks of [2, 3, 4, 5]) {
        add({
          id: `hybrid_draw_poisson_${poisson.key}_d${drawIndex + 1}_n${maxPicks}`,
          name: `平局泊松混合 ${maxPicks} 格`,
          family: 'hybrid',
          style: maxPicks <= 2 ? 'selected' : maxPicks <= 4 ? 'balanced' : 'attack',
          parameters: { drawScores, poisson: poisson.key, maxPicks },
          description: `先保留 ${drawScores.join('、')}，再用泊松 EV 补足到 ${maxPicks} 个比分。`,
          explanation: '把低平局作为结构锚点，再用泊松 EV 寻找非平局补充项。',
          selectPicks: ({ odds, context }) => uniquePicks([
            ...pickFixedScores(odds, drawScores),
            ...poisson.builder({ odds, context, options: { maxPicks, minPicks: 1 } }).picks,
          ]).slice(0, maxPicks),
        });
      }
    }
  }

  for (const maxPicks of [3, 4, 5]) {
    for (const consensusCount of [1, 2, 3]) {
      add({
        id: `hybrid_consensus_draw_c${consensusCount}_n${maxPicks}`,
        name: `共识平局混合 ${maxPicks} 格`,
        family: 'hybrid',
        style: maxPicks <= 3 ? 'balanced' : 'attack',
        parameters: { consensusCount, drawScores: ['1-1', '0-0', '2-2'], maxPicks },
        description: `先取 ${consensusCount} 个最低赔率比分，再用 1-1/0-0/2-2 补足。`,
        explanation: '把市场最低赔和低平局保护组合在一起，测试共识与结构保护的折中。',
        selectPicks: ({ odds }) => uniquePicks([
          ...sortByOdds(odds).slice(0, consensusCount),
          ...pickFixedScores(odds, ['1-1', '0-0', '2-2']),
        ]).slice(0, maxPicks),
      });
    }
  }
}

function addFavoriteCoverStrategies(add) {
  for (const favoriteMaxOdds of [4, 5, 6, 7]) {
    for (const underdogMinOdds of [8, 10, 12, 15]) {
      for (const maxPicks of [2, 3, 4, 5]) {
        add({
          id: `favorite_cover_f${favoriteMaxOdds}_u${underdogMinOdds}_n${maxPicks}`,
          name: `热门小胜 ${maxPicks} 格`,
          family: 'favorite_cover',
          style: maxPicks <= 2 ? 'selected' : 'attack',
          parameters: { favoriteMaxOdds, underdogMinOdds, maxPicks },
          description: `热门最低赔率 <= ${favoriteMaxOdds} 且弱势方最低赔率 >= ${underdogMinOdds} 时，覆盖热门方小胜。`,
          explanation: '强弱分明时押热门一球/两球小胜，并按 pick 数控制成本。',
          selectPicks: ({ odds }) => pickFavoriteCover({ odds, favoriteMaxOdds, underdogMinOdds, maxPicks }),
        });
      }
    }
  }
}

function pickOutcomeBalance({ odds, perOutcome, maxOdds, includeDrawFirst }) {
  const home = sortByOdds(odds.filter((pick) => getScoreOutcome(pick.score) === 'home' && pick.odds <= maxOdds)).slice(0, perOutcome);
  const draw = sortByOdds(odds.filter((pick) => getScoreOutcome(pick.score) === 'draw' && pick.odds <= maxOdds)).slice(0, perOutcome);
  const away = sortByOdds(odds.filter((pick) => getScoreOutcome(pick.score) === 'away' && pick.odds <= maxOdds)).slice(0, perOutcome);
  const picks = includeDrawFirst ? [...draw, ...home, ...away] : [...home, ...draw, ...away];
  return uniquePicks(picks);
}

function addUnderdogProtectionStrategies(add) {
  for (const favoriteMaxOdds of [4, 5, 6, 7]) {
    for (const maxPicks of [2, 3, 4]) {
      add({
        id: `underdog_protect_f${favoriteMaxOdds}_n${maxPicks}`,
        name: `弱队偷分 ${maxPicks} 格`,
        family: 'underdog_protection',
        style: maxPicks <= 2 ? 'selected' : 'balanced',
        parameters: { favoriteMaxOdds, maxPicks },
        description: `强热门盘下保留弱队小胜和平局保护，共 ${maxPicks} 个比分。`,
        explanation: '市场过度集中热门时，用弱队偷分和 1-1 做保护。',
        selectPicks: ({ odds }) => pickUnderdogProtection({ odds, favoriteMaxOdds, maxPicks }),
      });
    }
  }
}

function addMidValueStrategies(add) {
  for (const minOdds of [7, 8, 10]) {
    for (const maxOdds of [15, 18, 25]) {
      for (const maxPicks of [2, 3, 4]) {
        add({
          id: `mid_value_${minOdds}_${maxOdds}_n${maxPicks}`,
          name: `中赔率价值 ${maxPicks} 格`,
          family: 'mid_value',
          style: maxPicks <= 2 ? 'selected' : 'attack',
          parameters: { minOdds, maxOdds, maxPicks },
          description: `避开极低赔和超高赔，选择 ${minOdds}-${maxOdds} 区间的 ${maxPicks} 个最低赔率比分。`,
          explanation: '寻找市场仍认可但回报更高的中赔率区域。',
          selectPicks: ({ odds }) => sortByOdds(odds.filter((pick) => pick.odds >= minOdds && pick.odds <= maxOdds)).slice(0, maxPicks),
        });
      }
    }
  }
}

function addTrendStrategies(add) {
  for (const direction of ['rise', 'fall']) {
    for (const minAbsChange of [5, 10, 15, 20]) {
      for (const maxPicks of [1, 2, 3]) {
        for (const maxOdds of [15, 25, 60]) {
          add({
            id: `trend_${direction}_${minAbsChange}_n${maxPicks}_cap${maxOdds}`,
            name: `${direction === 'rise' ? '赔率上升' : '赔率下降'} ${maxPicks} 格`,
            family: 'trend',
            style: maxPicks <= 2 ? 'selected' : 'attack',
            parameters: { direction, minAbsChange, maxPicks, maxOdds },
            description: `选择赔率${direction === 'rise' ? '上升' : '下降'}至少 ${minAbsChange}% 且不高于 ${maxOdds} 的 ${maxPicks} 个比分。`,
            explanation: direction === 'rise'
              ? '观察被市场放大的回报项，但用赔率上限过滤纯长尾噪音。'
              : '跟随被市场压低赔率的比分，测试临场资金信号。',
            selectPicks: ({ odds }) => pickTrend({ odds, direction, minAbsChange, maxPicks, maxOdds }),
          });
        }
      }
    }
  }
}

function addPoissonEvStrategies(add) {
  const builders = [
    { key: 'context_v1', name: '赛前泊松EV基础', builder: buildContextPoissonEvSelection, style: 'balanced' },
    { key: 'context_v2', name: '赛前泊松EV精选', builder: buildContextPoissonEvV2Selection, style: 'selected' },
    { key: 'context_v3', name: '赛前泊松EV均衡', builder: buildContextPoissonEvV3Selection, style: 'balanced' },
  ];
  for (const variant of builders) {
    for (const maxPicks of [1, 2, 3, 4]) {
      for (const maxSelectableOdds of [35, 50, 65]) {
        for (const minSelectableProbability of [0.006, 0.01, 0.014]) {
          add({
            id: `poisson_${variant.key}_n${maxPicks}_cap${maxSelectableOdds}_p${String(minSelectableProbability).replace('.', '_')}`,
            name: `${variant.name} ${maxPicks} 格`,
            family: 'poisson_ev',
            style: maxPicks <= 2 ? 'selected' : variant.style,
            parameters: { variant: variant.key, maxPicks, maxSelectableOdds, minSelectableProbability },
            description: `${variant.name} 参数扫描：最多 ${maxPicks} 个比分，赔率上限 ${maxSelectableOdds}，概率下限 ${minSelectableProbability}。`,
            explanation: '先生成比分概率，再用 EV=概率*赔率-1 排序，参数控制风险和信息量。',
            selectPicks: ({ odds, context }) => variant.builder({
              odds,
              context,
              options: {
                maxPicks,
                minPicks: Math.min(maxPicks, maxPicks <= 1 ? 1 : 2),
                maxSelectableOdds,
                minSelectableProbability,
              },
            }).picks,
          });
        }
      }
    }
  }

  for (const variant of builders) {
    for (const maxPicks of [2, 3, 4]) {
      for (const maxSelectableOdds of [25, 35, 50]) {
        for (const minSelectableProbability of [0.006, 0.01]) {
          add({
            id: `poisson_diverse_${variant.key}_n${maxPicks}_cap${maxSelectableOdds}_p${String(minSelectableProbability).replace('.', '_')}`,
            name: `${variant.name} 多样性 ${maxPicks} 格`,
            family: 'poisson_ev',
            style: maxPicks <= 2 ? 'selected' : 'balanced',
            parameters: {
              variant: variant.key,
              maxPicks,
              maxSelectableOdds,
              minSelectableProbability,
              diversity: 'outcome',
            },
            description: `${variant.name} 先取 EV 候选池，再优先覆盖不同赛果方向，最多 ${maxPicks} 个。`,
            explanation: '避免泊松 EV 全部挤在相邻低平局，用胜/平/负方向多样性提高推荐形态。',
            selectPicks: ({ odds, context }) => pickDiversePoissonEv({
              odds,
              context,
              builder: variant.builder,
              maxPicks,
              maxSelectableOdds,
              minSelectableProbability,
            }),
          });
        }
      }
    }
  }

  for (const variant of [
    { key: 'context_v1', name: '赛前泊松EV基础', builder: buildContextPoissonEvSelection },
    { key: 'context_v3', name: '赛前泊松EV均衡', builder: buildContextPoissonEvV3Selection },
  ]) {
    for (const basePicks of [2, 3]) {
      for (const drawMaxOdds of [5.5, 6.5, 7, 7.5]) {
        add({
          id: `poisson_drawguard_${variant.key}_n${basePicks}_draw${String(drawMaxOdds).replace('.', '_')}_cap35_p0_006`,
          name: `${variant.name} 平局保护`,
          family: 'poisson_ev',
          style: basePicks <= 2 ? 'selected' : 'balanced',
          parameters: {
            variant: variant.key,
            basePicks,
            maxSelectableOdds: 35,
            minSelectableProbability: 0.006,
            diversity: 'outcome',
            drawGuardScore: '1-1',
            drawMaxOdds,
          },
          description: `${variant.name} 先取 ${basePicks} 个多样性 EV 候选；若 1-1 不高于 ${drawMaxOdds}，额外加入 1-1。`,
          explanation: '用平局低赔识别接近比赛，把 1-1 作为低成本保护，同时保留泊松 EV 的方向多样性。',
          selectPicks: ({ odds, context }) => pickPoissonDrawGuard({
            odds,
            context,
            builder: variant.builder,
            basePicks,
            drawMaxOdds,
            maxSelectableOdds: 35,
            minSelectableProbability: 0.006,
          }),
        });
      }
    }
  }
}

function pickSourceConsensusPoisson({
  odds,
  context,
  sourceCount,
  maxPicks,
  maxSourceOdds,
  poissonBuilder,
}) {
  const sourceCandidates = buildSourceConsensusSelection({
    odds,
    context,
    maxPicks: Math.max(sourceCount * 2, sourceCount + 2),
  }).picks;
  const sourcePicks = sourceCandidates
    .filter((pick) => pick.odds <= maxSourceOdds || String(pick.reason || '').includes('明确'))
    .slice(0, sourceCount);
  const poissonPicks = poissonBuilder({
    odds,
    context,
    options: {
      maxPicks,
      minPicks: 2,
      maxSelectableOdds: 35,
      minSelectableProbability: 0.006,
    },
  }).picks;
  return uniquePicks([...sourcePicks, ...poissonPicks]).slice(0, maxPicks);
}

function pickAdaptiveDrawAnchor({
  odds,
  drawMaxOdds,
  maxPickOdds,
  favoriteGap,
  homeFourth,
  awayFourth,
  balancedFourth,
}) {
  const drawMin = minOddsForOutcome(odds, 'draw');
  const homeMin = minOddsForOutcome(odds, 'home');
  const awayMin = minOddsForOutcome(odds, 'away');
  const baseScores = drawMin <= drawMaxOdds ? ['1-1', '0-0', '2-2'] : ['1-1', '0-0'];
  let fourth = balancedFourth;
  if (homeMin + favoriteGap < awayMin) fourth = homeFourth;
  if (awayMin + favoriteGap < homeMin) fourth = awayFourth;
  return pickFixedScores(odds, [...baseScores, fourth]).filter((pick) => pick.odds <= maxPickOdds);
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

  return uniquePicks([...selected, ...pool]).slice(0, maxPicks);
}

function pickPoissonDrawGuard({
  odds,
  context,
  builder,
  basePicks,
  drawMaxOdds,
  maxSelectableOdds,
  minSelectableProbability,
}) {
  const base = pickDiversePoissonEv({
    odds,
    context,
    builder,
    maxPicks: basePicks,
    maxSelectableOdds,
    minSelectableProbability,
  });
  const modelSelection = builder({
    odds,
    context,
    options: {
      maxPicks: 12,
      minPicks: 2,
      maxSelectableOdds,
      minSelectableProbability,
    },
  });
  const oddsOneOne = (odds || []).find((pick) => pick.score === '1-1' && Number(pick.odds) <= drawMaxOdds);
  const modelOneOne = modelSelection.evTable?.find((pick) => pick.score === '1-1');
  const drawGuard = oddsOneOne ? [modelOneOne || oddsOneOne] : [];
  return uniquePicks([...drawGuard, ...base]).slice(0, oddsOneOne ? Math.max(basePicks, 3) : basePicks);
}

function pickFavoriteCover({ odds, favoriteMaxOdds, underdogMinOdds, maxPicks }) {
  const homeMin = minOddsForOutcome(odds, 'home');
  const awayMin = minOddsForOutcome(odds, 'away');
  if (homeMin <= favoriteMaxOdds && awayMin >= underdogMinOdds) {
    return pickFixedScores(odds, ['1-0', '2-0', '2-1', '3-0', '3-1']).slice(0, maxPicks);
  }
  if (awayMin <= favoriteMaxOdds && homeMin >= underdogMinOdds) {
    return pickFixedScores(odds, ['0-1', '0-2', '1-2', '0-3', '1-3']).slice(0, maxPicks);
  }
  return sortByOdds(odds).slice(0, maxPicks);
}

function pickUnderdogProtection({ odds, favoriteMaxOdds, maxPicks }) {
  const homeMin = minOddsForOutcome(odds, 'home');
  const awayMin = minOddsForOutcome(odds, 'away');
  if (homeMin <= favoriteMaxOdds && awayMin > homeMin) {
    return pickFixedScores(odds, ['0-1', '1-1', '1-2', '0-0']).slice(0, maxPicks);
  }
  if (awayMin <= favoriteMaxOdds && homeMin > awayMin) {
    return pickFixedScores(odds, ['1-0', '1-1', '2-1', '0-0']).slice(0, maxPicks);
  }
  return pickFixedScores(odds, ['1-1', '0-0', '2-2']).slice(0, maxPicks);
}

function pickTrend({ odds, direction, minAbsChange, maxPicks, maxOdds }) {
  const trendFiltered = odds.filter((pick) => (
    Number.isFinite(Number(pick.changePct))
    && pick.odds <= maxOdds
    && (direction === 'rise' ? pick.changePct >= minAbsChange : pick.changePct <= -minAbsChange)
  ));
  const sorted = [...trendFiltered].sort((a, b) => (
    direction === 'rise'
      ? b.changePct - a.changePct || a.odds - b.odds
      : a.changePct - b.changePct || a.odds - b.odds
  ));
  return sorted.slice(0, maxPicks);
}

function pickFixedScores(odds, scores) {
  const oddsByScore = new Map(odds.map((option) => [option.score, option]));
  return scores.filter((score) => oddsByScore.has(score)).map((score) => oddsByScore.get(score));
}

function sortByOdds(odds) {
  return [...odds].sort((a, b) => a.odds - b.odds || a.score.localeCompare(b.score));
}

function buildSelectionSignature(rows) {
  return rows
    .map((row) => (row.picks || []).map((pick) => pick.score).join(','))
    .join('|');
}

function uniquePicks(picks) {
  const seen = new Set();
  const unique = [];
  for (const pick of picks || []) {
    if (!pick?.score || seen.has(pick.score)) continue;
    seen.add(pick.score);
    unique.push(pick);
  }
  return unique;
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

function getFailedGateReasons(result, gate) {
  const reasons = [];
  if (result.roiPercent < gate.minRoiPercent) reasons.push(`ROI ${result.roiPercent}% < ${gate.minRoiPercent}%`);
  if (result.settledMatches < gate.minSettledMatches) reasons.push(`settled ${result.settledMatches} < ${gate.minSettledMatches}`);
  if (result.hitMatches < gate.minHitMatches) reasons.push(`hits ${result.hitMatches} < ${gate.minHitMatches}`);
  if (result.avgPicks < gate.minAvgPicks) reasons.push(`avgPicks ${result.avgPicks} < ${gate.minAvgPicks}`);
  if (result.avgPicks > gate.maxAvgPicks) reasons.push(`avgPicks ${result.avgPicks} > ${gate.maxAvgPicks}`);
  if (result.maxPicks > gate.maxPicks) reasons.push(`maxPicks ${result.maxPicks} > ${gate.maxPicks}`);
  return reasons;
}

function sortStrategyResults(a, b) {
  return b.roiPercent - a.roiPercent
    || b.netProfit - a.netProfit
    || b.hitMatches - a.hitMatches
    || a.avgPicks - b.avgPicks
    || a.strategyId.localeCompare(b.strategyId);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function roundMetric(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
