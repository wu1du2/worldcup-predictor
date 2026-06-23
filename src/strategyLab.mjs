import { exactSportteryScores, sportteryScoreTemplate } from './scoreTemplate.mjs';

const validScores = new Set(sportteryScoreTemplate);
const leakedResultFields = ['homeScore', 'awayScore', 'home_score', 'away_score', 'actualScore', 'result'];

export function buildPredictionContext({
  match,
  scoreOptions,
  generatedAt = new Date().toISOString(),
  publicContext = { notes: [] },
}) {
  return {
    schemaVersion: 1,
    generatedAt,
    match: {
      id: match.id,
      date: match.date,
      time: match.time,
      kickoffAt: match.kickoffAt || match.kickoff_at_utc || '',
      home: match.home,
      away: match.away,
      stage: match.stage || '',
    },
    market: {
      scoreOptions: (scoreOptions || []).map((option) => ({
        score: option.score,
        odds: Number(option.odds),
        ...(option.trend ? { trend: option.trend } : {}),
      })),
    },
    publicContext,
  };
}

export function predict(strategy, context) {
  assertNoResultLeak(context);

  const strategyScores = extractStrategyScores(strategy);
  const oddsByScore = new Map(
    (context.market?.scoreOptions || []).map((option) => [option.score, Number(option.odds)]),
  );
  const stakes = strategyScores
    .filter((score) => oddsByScore.has(score))
    .map((score) => ({ score, stake: extractStake(strategy) }));

  return {
    reason: [
      `策略：${firstNonEmptyLine(strategy)}`,
      `比赛：${context.match.home} vs ${context.match.away}`,
      `执行：按 strategy string 提取候选比分，只保留本场有赔率的比分，每项 ${extractStake(strategy)} 注。`,
    ].join('\n'),
    stakes,
  };
}

export function settlePrediction({ context, prediction, result }) {
  const actualScore = `${result.homeScore}-${result.awayScore}`;
  const oddsByScore = new Map(
    (context.market?.scoreOptions || []).map((option) => [option.score, Number(option.odds)]),
  );
  const cost = sum((prediction.stakes || []).map((stake) => Number(stake.stake) || 0));
  let revenue = 0;
  let hitScore = '';

  for (const stake of prediction.stakes || []) {
    if (!isWinningScoreLabel(result, stake.score)) continue;
    hitScore = stake.score;
    revenue += (Number(stake.stake) || 0) * (oddsByScore.get(stake.score) || 0);
  }

  return {
    matchId: context.match.id,
    match: `${context.match.home} vs ${context.match.away}`,
    actualScore,
    stakes: prediction.stakes || [],
    hitScore,
    cost: roundMetric(cost),
    revenue: roundMetric(revenue),
    netProfit: roundMetric(revenue - cost),
  };
}

export function runStrategyExperiment({ strategy, contexts, resultsByMatchId = {} }) {
  const predictionLogs = (contexts || []).map((context) => ({
    matchId: context.match.id,
    context,
    prediction: predict(strategy, context),
  }));
  const settlements = predictionLogs
    .filter((log) => resultsByMatchId[log.matchId])
    .map((log) => settlePrediction({
      context: log.context,
      prediction: log.prediction,
      result: resultsByMatchId[log.matchId],
    }));

  return {
    schemaVersion: 1,
    strategy,
    generatedAt: new Date().toISOString(),
    predictionLogs,
    settlements,
    summary: buildSummary(settlements),
  };
}

export function verifyStrategyRun(run) {
  for (const log of run.predictionLogs || []) {
    assertNoResultLeak(log.context);
    if (!Array.isArray(log.prediction?.stakes)) {
      throw new Error(`Prediction for ${log.matchId} has no stake list.`);
    }
    for (const stake of log.prediction.stakes) {
      if (!validScores.has(stake.score)) {
        throw new Error(`Prediction for ${log.matchId} contains invalid score ${stake.score}.`);
      }
      if (!Number.isFinite(Number(stake.stake)) || Number(stake.stake) <= 0) {
        throw new Error(`Prediction for ${log.matchId} contains invalid stake for ${stake.score}.`);
      }
    }
  }

  return {
    ok: true,
    contexts: run.predictionLogs?.length || 0,
    predictions: run.predictionLogs?.length || 0,
    settlements: run.settlements?.length || 0,
    summary: run.summary,
  };
}

export function formatStrategyReport(run) {
  const lines = [
    '【Strategy Lab】',
    `策略：${firstNonEmptyLine(run.strategy)}`,
    `预测场次：${run.predictionLogs.length}`,
    `已结算：${run.settlements.length}`,
    `总成本：${formatMetric(run.summary.totalCost)}`,
    `总返还：${formatMetric(run.summary.totalRevenue)}`,
    `净收益：${formatSigned(run.summary.netProfit)}`,
    `ROI：${formatSigned(run.summary.roiPercent)}%`,
    '',
    '【预测记录】',
  ];

  for (const log of run.predictionLogs) {
    const stakes = log.prediction.stakes.map((stake) => `${stake.score} x${stake.stake}`).join(', ');
    lines.push(`${log.context.match.date} ${log.context.match.time} ${log.context.match.home} vs ${log.context.match.away}`);
    lines.push(`理由：${log.prediction.reason.replace(/\n/g, ' / ')}`);
    lines.push(`下注：${stakes || '无'}`);
  }

  if (run.settlements.length) {
    lines.push('', '【结算记录】');
    for (const settlement of run.settlements) {
      lines.push(`${settlement.match} [${settlement.actualScore}] 命中 ${settlement.hitScore || '无'}｜净收益 ${formatSigned(settlement.netProfit)}`);
    }
  }

  return lines.join('\n');
}

function buildSummary(settlements) {
  const totalCost = sum(settlements.map((settlement) => settlement.cost));
  const totalRevenue = sum(settlements.map((settlement) => settlement.revenue));
  const netProfit = totalRevenue - totalCost;

  return {
    settledMatches: settlements.length,
    hitMatches: settlements.filter((settlement) => settlement.hitScore).length,
    totalCost: roundMetric(totalCost),
    totalRevenue: roundMetric(totalRevenue),
    netProfit: roundMetric(netProfit),
    roiPercent: totalCost > 0 ? roundMetric((netProfit / totalCost) * 100) : 0,
  };
}

function assertNoResultLeak(value, path = 'context') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (leakedResultFields.includes(key)) {
      throw new Error(`${path} leaks result field ${key}.`);
    }
    assertNoResultLeak(child, `${path}.${key}`);
  }
}

function extractStrategyScores(strategy) {
  const matches = String(strategy).match(/\d+-\d+|胜其他|平其他|负其他/g) || [];
  return [...new Set(matches)].filter((score) => validScores.has(score));
}

function extractStake(strategy) {
  const match = String(strategy).match(/每个比分\s*(\d+(?:\.\d+)?)\s*注|每项\s*(\d+(?:\.\d+)?)\s*注|x\s*(\d+(?:\.\d+)?)/);
  return Number(match?.[1] || match?.[2] || match?.[3] || 1);
}

function firstNonEmptyLine(text) {
  return String(text).split('\n').map((line) => line.trim()).filter(Boolean)[0] || '未命名策略';
}

function isWinningScoreLabel(result, score) {
  const actualScore = `${result.homeScore}-${result.awayScore}`;
  if (score === actualScore) return true;
  if (exactSportteryScores.has(actualScore)) return false;

  if (result.homeScore > result.awayScore) return score === '胜其他';
  if (result.homeScore === result.awayScore) return score === '平其他';
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
