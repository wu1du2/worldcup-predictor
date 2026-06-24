import { exactSportteryScores, sportteryScoreTemplate } from './scoreTemplate.mjs';

const defaultMaxGoals = 12;
const defaultMaxPicks = 4;
const defaultMinPicks = 1;

export function buildMarketPoissonEvSelection({ odds, context = {}, options = {} }) {
  const selectionOptions = { maxSelectableOdds: 80, minSelectableProbability: 0.003, ...options };
  const normalizedOdds = normalizeOdds(odds);
  const marketProbabilities = buildMarketProbabilities(normalizedOdds);
  const fitted = fitPoissonToMarket(marketProbabilities, selectionOptions);
  const adjustedModel = applyLambdaContextAdjustments(fitted, context);
  const table = buildPoissonScoreProbabilityTable(adjustedModel);
  const adjustedTable = applyProbabilityContextAdjustments(table, context);
  const evTable = buildEvTable({ probabilityTable: adjustedTable, odds: normalizedOdds });
  const picks = selectEvPicks(evTable, selectionOptions);

  return {
    strategyId: 'market_poisson_ev',
    strategyName: '市场泊松EV',
    model: adjustedModel,
    probabilityTable: adjustedTable,
    evTable,
    picks,
    reason: [
      `市场赔率拟合 λ=${formatMetric(adjustedModel.lambdaHome)}-${formatMetric(adjustedModel.lambdaAway)}。`,
      '用 Poisson + Dixon-Coles 低比分修正生成比分概率，再按 p*odds-1 选择最高 EV。',
    ].join(''),
  };
}

export function buildContextPoissonEvSelection({ odds, context = {}, options = {} }) {
  const selectionOptions = { maxSelectableOdds: 60, minSelectableProbability: 0.003, ...options };
  const normalizedOdds = normalizeOdds(odds);
  const base = getContextExpectedGoals(context);
  const adjustedModel = applyLambdaContextAdjustments(base, context);
  const table = buildPoissonScoreProbabilityTable(adjustedModel);
  const adjustedTable = applyProbabilityContextAdjustments(table, context);
  const evTable = buildEvTable({ probabilityTable: adjustedTable, odds: normalizedOdds });
  const picks = selectEvPicks(evTable, selectionOptions);

  return {
    strategyId: 'context_poisson_ev',
    strategyName: '赛前泊松EV',
    model: adjustedModel,
    probabilityTable: adjustedTable,
    evTable,
    picks,
    reason: [
      `独立赛前 context 估计 λ=${formatMetric(adjustedModel.lambdaHome)}-${formatMetric(adjustedModel.lambdaAway)}。`,
      '赔率只用于 EV 结算比较，不作为主概率先验。',
    ].join(''),
  };
}

export function buildPoissonScoreProbabilityTable(model) {
  const lambdaHome = clamp(Number(model.lambdaHome) || 1.2, 0.15, 5.5);
  const lambdaAway = clamp(Number(model.lambdaAway) || 1.05, 0.15, 5.5);
  const rho = clamp(Number(model.rho) || 0, -0.25, 0.25);
  const maxGoals = Number.isInteger(model.maxGoals) ? model.maxGoals : defaultMaxGoals;
  const probabilities = Object.fromEntries(sportteryScoreTemplate.map((score) => [score, 0]));

  for (let home = 0; home <= maxGoals; home += 1) {
    for (let away = 0; away <= maxGoals; away += 1) {
      const score = toSportteryScore(home, away);
      const probability = poissonProbability(home, lambdaHome)
        * poissonProbability(away, lambdaAway)
        * dixonColesFactor({ home, away, lambdaHome, lambdaAway, rho });
      probabilities[score] += Math.max(0, probability);
    }
  }

  return normalizeProbabilityRows(
    sportteryScoreTemplate.map((score) => ({
      score,
      probability: probabilities[score] || 0,
    })),
  );
}

function fitPoissonToMarket(marketProbabilities, options) {
  const targetRows = marketProbabilities.filter((row) => row.probability > 0);
  const moment = estimateMomentLambda(targetRows);
  const lambdaStep = Number(options.lambdaStep) || 0.1;
  const rhoValues = options.rhoValues || [-0.12, -0.08, -0.04, 0, 0.04, 0.08, 0.12];
  let best = { lambdaHome: moment.lambdaHome, lambdaAway: moment.lambdaAway, rho: 0, error: Number.POSITIVE_INFINITY };

  for (const lambdaHome of rangeAround(moment.lambdaHome, lambdaStep)) {
    for (const lambdaAway of rangeAround(moment.lambdaAway, lambdaStep)) {
      for (const rho of rhoValues) {
        const table = buildPoissonScoreProbabilityTable({ lambdaHome, lambdaAway, rho });
        const modelByScore = new Map(table.map((row) => [row.score, row.probability]));
        const error = targetRows.reduce((total, target) => {
          const modelProbability = modelByScore.get(target.score) || 0.000001;
          return total + ((Math.log(modelProbability) - Math.log(target.probability)) ** 2);
        }, 0);
        if (error < best.error) best = { lambdaHome, lambdaAway, rho, error };
      }
    }
  }

  return {
    lambdaHome: roundMetric(best.lambdaHome),
    lambdaAway: roundMetric(best.lambdaAway),
    rho: roundMetric(best.rho),
  };
}

function estimateMomentLambda(rows) {
  let homeXg = 0;
  let awayXg = 0;
  for (const row of rows) {
    const proxy = scoreGoalProxy(row.score);
    homeXg += proxy.home * row.probability;
    awayXg += proxy.away * row.probability;
  }

  return {
    lambdaHome: clamp(roundMetric(homeXg), 0.35, 4.8),
    lambdaAway: clamp(roundMetric(awayXg), 0.35, 4.8),
  };
}

function scoreGoalProxy(score) {
  const match = String(score).match(/^(\d+)-(\d+)$/);
  if (match) return { home: Number(match[1]), away: Number(match[2]) };
  if (score === '胜其他') return { home: 5.5, away: 1.2 };
  if (score === '平其他') return { home: 4.5, away: 4.5 };
  if (score === '负其他') return { home: 1.2, away: 5.5 };
  return { home: 1.2, away: 1.1 };
}

function getContextExpectedGoals(context) {
  const model = context?.model || {};
  const publicContext = context?.publicContext || {};
  const expectedGoals = model.expectedGoals || publicContext.expectedGoals || {};
  const lambdaHome = Number(expectedGoals.home ?? model.lambdaHome ?? publicContext.lambdaHome ?? 1.22);
  const lambdaAway = Number(expectedGoals.away ?? model.lambdaAway ?? publicContext.lambdaAway ?? 1.06);

  return {
    lambdaHome: clamp(lambdaHome, 0.15, 5.5),
    lambdaAway: clamp(lambdaAway, 0.15, 5.5),
    rho: clamp(Number(model.rho ?? publicContext.rho ?? -0.03), -0.25, 0.25),
  };
}

function applyLambdaContextAdjustments(model, context) {
  const adjustment = context?.model || context?.publicContext?.modelAdjustments || {};
  const totalGoalsMultiplier = Number(adjustment.totalGoalsMultiplier) || 1;
  const lambdaHomeMultiplier = Number(adjustment.lambdaHomeMultiplier ?? adjustment.homeAttackMultiplier ?? 1);
  const lambdaAwayMultiplier = Number(adjustment.lambdaAwayMultiplier ?? adjustment.awayAttackMultiplier ?? 1);
  const rhoAdjustment = Number(adjustment.rhoAdjustment) || 0;

  return {
    lambdaHome: roundMetric(clamp(model.lambdaHome * totalGoalsMultiplier * lambdaHomeMultiplier, 0.15, 5.5)),
    lambdaAway: roundMetric(clamp(model.lambdaAway * totalGoalsMultiplier * lambdaAwayMultiplier, 0.15, 5.5)),
    rho: roundMetric(clamp((Number(model.rho) || 0) + rhoAdjustment, -0.25, 0.25)),
  };
}

function applyProbabilityContextAdjustments(table, context) {
  const adjustment = context?.model || context?.publicContext?.modelAdjustments || {};
  const drawMultiplier = Number(adjustment.drawMultiplier) || 1;
  const lowScoreMultiplier = Number(adjustment.lowScoreMultiplier) || 1;

  if (drawMultiplier === 1 && lowScoreMultiplier === 1) return table;

  return normalizeProbabilityRows(table.map((row) => ({
    ...row,
    probability: row.probability
      * (isDrawScore(row.score) ? drawMultiplier : 1)
      * (isLowScore(row.score) ? lowScoreMultiplier : 1),
  })));
}

function buildMarketProbabilities(odds) {
  const impliedRows = odds
    .filter((option) => Number(option.odds) > 1)
    .map((option) => ({ score: option.score, probability: 1 / Number(option.odds) }));
  return normalizeProbabilityRows(impliedRows);
}

function buildEvTable({ probabilityTable, odds }) {
  const oddsByScore = new Map(odds.map((option) => [option.score, Number(option.odds)]));
  return probabilityTable
    .filter((row) => oddsByScore.has(row.score))
    .map((row) => {
      const oddsValue = oddsByScore.get(row.score);
      return {
        score: row.score,
        odds: oddsValue,
        probability: roundMetric(row.probability),
        ev: roundMetric((row.probability * oddsValue) - 1),
      };
    })
    .sort((a, b) => b.ev - a.ev || b.probability - a.probability || a.odds - b.odds || a.score.localeCompare(b.score));
}

function selectEvPicks(evTable, options = {}) {
  const maxPicks = Number(options.maxPicks) || defaultMaxPicks;
  const minPicks = Number(options.minPicks) || defaultMinPicks;
  const minEv = Number.isFinite(Number(options.minEv)) ? Number(options.minEv) : 0;
  const maxSelectableOdds = Number(options.maxSelectableOdds) || Number.POSITIVE_INFINITY;
  const minSelectableProbability = Number(options.minSelectableProbability) || 0;
  const selectable = evTable.filter((row) => (
    row.odds <= maxSelectableOdds
    && row.probability >= minSelectableProbability
  ));
  const fallback = selectable.length ? selectable : evTable.filter((row) => row.odds <= maxSelectableOdds);
  const pool = fallback.length ? fallback : evTable;
  const positive = pool.filter((row) => row.ev >= minEv).slice(0, maxPicks);
  const selected = positive.length >= minPicks ? positive : pool.slice(0, Math.max(minPicks, 1));
  return selected.map((row) => ({
    score: row.score,
    odds: row.odds,
    probability: row.probability,
    ev: row.ev,
  }));
}

function normalizeOdds(odds) {
  const validScores = new Set(sportteryScoreTemplate);
  return (odds || [])
    .filter((option) => validScores.has(option.score) && Number.isFinite(Number(option.odds)) && Number(option.odds) > 1)
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

function normalizeProbabilityRows(rows) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.probability), 0) || 1;
  return rows.map((row) => ({
    score: row.score,
    probability: Math.max(0, row.probability) / total,
  }));
}

function toSportteryScore(home, away) {
  const exact = `${home}-${away}`;
  if (exactSportteryScores.has(exact)) return exact;
  if (home > away) return '胜其他';
  if (home === away) return '平其他';
  return '负其他';
}

function poissonProbability(goals, lambda) {
  return (Math.exp(-lambda) * (lambda ** goals)) / factorial(goals);
}

function dixonColesFactor({ home, away, lambdaHome, lambdaAway, rho }) {
  if (home === 0 && away === 0) return Math.max(0.05, 1 - (lambdaHome * lambdaAway * rho));
  if (home === 0 && away === 1) return Math.max(0.05, 1 + (lambdaHome * rho));
  if (home === 1 && away === 0) return Math.max(0.05, 1 + (lambdaAway * rho));
  if (home === 1 && away === 1) return Math.max(0.05, 1 - rho);
  return 1;
}

function isDrawScore(score) {
  if (score === '平其他') return true;
  const match = String(score).match(/^(\d+)-(\d+)$/);
  return match ? match[1] === match[2] : false;
}

function isLowScore(score) {
  const match = String(score).match(/^(\d+)-(\d+)$/);
  if (!match) return false;
  return Number(match[1]) + Number(match[2]) <= 2;
}

function rangeAround(center, step) {
  const values = [];
  const start = clamp(center - 0.8, 0.25, 5);
  const end = clamp(center + 0.8, 0.25, 5);
  for (let value = start; value <= end + 0.000001; value += step) {
    values.push(roundMetric(value));
  }
  return values;
}

function factorial(value) {
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function roundMetric(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

function formatMetric(value) {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}
