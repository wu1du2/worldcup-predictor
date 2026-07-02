import {
  formatSettlementScore,
  isSettledMatch,
  isWinningScoreLabel as isSettlementWinningScoreLabel,
} from './settlementScore.mjs';

export function backtestLowestOddsStrategy({
  strategyName,
  pickCount,
  matches,
  scoreOddsByMatch,
}) {
  const rows = [];

  for (const match of matches || []) {
    if (!isCompletedMatch(match)) continue;
    const odds = (scoreOddsByMatch?.[match.id] || [])
      .filter((option) => option.score && Number.isFinite(Number(option.odds)))
      .map((option) => ({ score: option.score, odds: Number(option.odds) }))
      .sort((a, b) => a.odds - b.odds || a.score.localeCompare(b.score));

    const row = buildSettledBacktestRow({ match, picks: odds.slice(0, pickCount), pickCount });
    if (row) rows.push(row);
  }

  return buildBacktestResult({ strategyName, pickCount, rows });
}

export function backtestTopPositiveTrendStrategy({
  strategyName,
  pickCount,
  matches,
  scoreOddsByMatch,
}) {
  const rows = [];

  for (const match of matches || []) {
    if (!isCompletedMatch(match)) continue;
    const trendOptions = (scoreOddsByMatch?.[match.id] || [])
      .filter((option) => (
        option.score
        && Number.isFinite(Number(option.odds))
        && Number.isFinite(Number(option.trend?.changePct))
        && Number(option.trend.changePct) > 0
      ))
      .map((option) => ({
        score: option.score,
        odds: Number(option.odds),
        changePct: Number(option.trend.changePct),
      }))
      .sort((a, b) => b.changePct - a.changePct || a.odds - b.odds || a.score.localeCompare(b.score));

    const row = buildSettledBacktestRow({ match, picks: trendOptions.slice(0, pickCount), pickCount });
    if (row) rows.push(row);
  }

  return buildBacktestResult({ strategyName, pickCount, rows });
}

export function backtestFixedScoresStrategy({
  strategyName,
  scores,
  matches,
  scoreOddsByMatch,
}) {
  const rows = [];

  for (const match of matches || []) {
    if (!isCompletedMatch(match)) continue;
    const oddsByScore = new Map(
      (scoreOddsByMatch?.[match.id] || [])
        .filter((option) => option.score && Number.isFinite(Number(option.odds)))
        .map((option) => [option.score, Number(option.odds)]),
    );
    const picks = scores
      .filter((score) => oddsByScore.has(score))
      .map((score) => ({ score, odds: oddsByScore.get(score) }));

    const row = buildSettledBacktestRow({ match, picks, pickCount: scores.length });
    if (row) rows.push(row);
  }

  return buildBacktestResult({ strategyName, pickCount: scores.length, rows });
}

function buildBacktestResult({ strategyName, pickCount, rows }) {
  const cost = sum(rows.map((row) => row.cost));
  const revenue = sum(rows.map((row) => row.revenue));
  const netProfit = revenue - cost;

  return {
    strategyName,
    pickCount,
    settledMatches: rows.length,
    cost,
    revenue,
    netProfit,
    roiPercent: cost > 0 ? roundMetric((netProfit / cost) * 100) : 0,
    hitMatches: rows.filter((row) => row.hitScore).length,
    rows,
  };
}

function buildSettledBacktestRow({ match, picks, pickCount }) {
  if (picks.length < pickCount) return null;

  const actualScore = formatSettlementScore(match);
  const hit = picks.find((pick) => isWinningScoreLabel(match, pick.score));
  const cost = picks.length;
  const revenue = hit ? hit.odds : 0;

  return {
    matchId: match.id,
    time: match.time,
    match: `${match.home} vs ${match.away}`,
    actualScore,
    picks,
    hitScore: hit?.score || '',
    hitOdds: hit?.odds || 0,
    cost,
    revenue,
    netProfit: revenue - cost,
  };
}

export function formatBacktestReport(result) {
  const lines = [
    `策略：${result.strategyName}`,
    `样本：已完场且有完整赔率 ${result.settledMatches} 场`,
    `总成本：${formatMetric(result.cost)}`,
    `总收入：${formatMetric(result.revenue)}`,
    `净收益：${formatSignedAmount(result.netProfit)}`,
    `ROI：${formatSignedAmount(result.roiPercent)}%`,
    `命中：${result.hitMatches}/${result.settledMatches}`,
    '',
  ];

  const hits = result.rows.filter((row) => row.hitScore);
  const misses = result.rows.filter((row) => !row.hitScore);

  if (hits.length) {
    lines.push('【命中明细】');
    for (const row of hits) {
      lines.push(`${row.time} ${row.match} ${row.hitScore}(${formatMetric(row.hitOdds)}) 收入 ${formatMetric(row.revenue)}｜净收益 ${formatSignedAmount(row.netProfit)}`);
    }
    lines.push('');
  }

  if (misses.length) {
    lines.push('【未中明细】');
    for (const row of misses) {
      const picks = row.picks.map((pick) => `${pick.score}(${formatMetric(pick.odds)})`).join(', ');
      lines.push(`${row.time} ${row.match} [${row.actualScore}] 买 ${picks}｜净收益 ${formatSignedAmount(row.netProfit)}`);
    }
  }

  return lines.join('\n').trimEnd();
}

function isCompletedMatch(match) {
  return isSettledMatch(match);
}

function isWinningScoreLabel(match, score) {
  return isSettlementWinningScoreLabel(match, score);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function formatSignedAmount(value) {
  const amount = formatMetric(value);
  return value > 0 ? `+${amount}` : amount;
}

function formatMetric(value) {
  const rounded = roundMetric(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}

function roundMetric(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
