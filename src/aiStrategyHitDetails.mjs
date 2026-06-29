import { deterministicUuid } from './stableUuid.mjs';

export function buildAiStrategyHitDetailsIndex(results = []) {
  const index = {};

  for (const result of results || []) {
    if (!result?.strategyId) continue;
    const detail = toAiStrategyHitDetail(result);
    index[result.strategyId] = detail;
    index[detail.systemStrategyId] = detail;
  }

  return index;
}

export function getAiStrategyHitDetail(index, row) {
  if (!row) return null;
  return index?.[row.strategyId] || null;
}

export function formatHitDetailRoi(value) {
  const number = Number(value) || 0;
  const rounded = Math.round((number + Number.EPSILON) * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
  return `${number > 0 ? '+' : ''}${text}%`;
}

function toAiStrategyHitDetail(result) {
  const systemStrategyId = deterministicUuid(`system:${result.strategyId}`);
  const hits = (result.rows || [])
    .filter((row) => row?.hitScore)
    .map(toHitRow)
    .sort((a, b) => (
      b.matchRoi - a.matchRoi
      || b.netProfit - a.netProfit
      || `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
    ));

  return {
    strategyId: result.strategyId,
    systemStrategyId,
    strategyName: result.strategyName || '',
    roiPercent: Number(result.roiPercent) || 0,
    cost: Number(result.cost) || 0,
    revenue: Number(result.revenue) || 0,
    netProfit: Number(result.netProfit) || 0,
    hitMatches: Number(result.hitMatches) || hits.length,
    settledMatches: Number(result.settledMatches) || 0,
    hits,
  };
}

function toHitRow(row) {
  const cost = Number(row.cost) || 0;
  const revenue = Number(row.revenue) || 0;
  const netProfit = Number(row.netProfit) || roundMetric(revenue - cost);

  return {
    matchId: row.matchId || '',
    date: row.date || '',
    time: row.time || '',
    match: row.match || '',
    actualScore: row.actualScore || '',
    hitScore: row.hitScore || '',
    hitOdds: Number(row.hitOdds) || 0,
    cost,
    revenue,
    netProfit,
    matchRoi: cost > 0 ? roundMetric((netProfit / cost) * 100) : 0,
  };
}

function roundMetric(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
