import {
  loadAiRecommendations,
  loadAiStrategyStats,
  loadImportReports,
  loadMatches,
  loadScoreOdds,
  mapAiRecommendationsByMatch,
  mapPredictionsByPlayer,
  mapScoreOddsByMatch,
  mergePlayers,
} from './supabaseData.mjs';
import { toAppMatch } from './matchSchedule.mjs';

export const staticSnapshotPath = '/data-snapshot.json';
export const staticGroupSnapshotDirectory = '/group-snapshots';

export async function loadStaticSnapshot({
  fetchImpl = fetch,
  path = staticSnapshotPath,
} = {}) {
  try {
    const response = await fetchImpl(`${path}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const snapshot = await response.json();
    return normalizeStaticSnapshot(snapshot);
  } catch {
    return null;
  }
}

export function normalizeStaticSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const matches = Array.isArray(snapshot.matches) ? snapshot.matches : [];
  return {
    generatedAt: snapshot.generatedAt || '',
    oddsWindow: snapshot.oddsWindow || null,
    matches,
    scoreOddsByMatch: snapshot.scoreOddsByMatch && typeof snapshot.scoreOddsByMatch === 'object'
      ? snapshot.scoreOddsByMatch
      : {},
    aiRecommendationsByMatch: snapshot.aiRecommendationsByMatch && typeof snapshot.aiRecommendationsByMatch === 'object'
      ? snapshot.aiRecommendationsByMatch
      : {},
    aiStrategyStats: Array.isArray(snapshot.aiStrategyStats) ? snapshot.aiStrategyStats : [],
    importReports: Array.isArray(snapshot.importReports) ? snapshot.importReports : [],
  };
}

export function getStaticGroupSnapshotPath(groupCode) {
  return `${staticGroupSnapshotDirectory}/${encodeURIComponent(groupCode)}.json`;
}

export async function loadStaticGroupSnapshot(groupCode, {
  fetchImpl = fetch,
  path = getStaticGroupSnapshotPath(groupCode),
} = {}) {
  if (!groupCode) return null;

  try {
    const response = await fetchImpl(`${path}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const snapshot = await response.json();
    return normalizeStaticGroupSnapshot(snapshot, { groupCode });
  } catch {
    return null;
  }
}

export function normalizeStaticGroupSnapshot(snapshot, { groupCode } = {}) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const group = snapshot.group && typeof snapshot.group === 'object' ? snapshot.group : null;
  if (!group?.id || !group?.code) return null;
  if (groupCode && group.code !== groupCode) return null;

  return {
    generatedAt: snapshot.generatedAt || '',
    group: {
      id: group.id,
      code: group.code,
      name: group.name || group.code,
    },
    players: mergePlayers(Array.isArray(snapshot.players) ? snapshot.players : []),
    predictions: mapPredictionsByPlayer(Array.isArray(snapshot.predictions) ? snapshot.predictions : []),
  };
}

export async function buildStaticSnapshot({ client, now = new Date() }) {
  const matches = await loadMatches({ client });
  const [scoreOddsByMatch, aiRecommendationsByMatch, strategyStatsResult, importReports] = await Promise.all([
    loadScoreOdds({ client, matches }),
    loadAiRecommendations({ client }),
    loadAiStrategyStats({ client, page: 0, pageSize: 50 }),
    loadImportReports({ client, limit: 20 }),
  ]);
  return {
    generatedAt: now.toISOString(),
    oddsWindow: null,
    matches,
    scoreOddsByMatch,
    aiRecommendationsByMatch,
    aiStrategyStats: strategyStatsResult.rows,
    importReports,
  };
}

export function buildStaticSnapshotFromBackupTables({ tables, now = new Date(), importReportLimit = 20 }) {
  const matches = (tables.matches || [])
    .filter((row) => row.active !== false)
    .map(toAppMatch)
    .filter((match) => match.id && match.date && match.time && match.home && match.away)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const importReports = (tables.import_reports || [])
    .map(toAppImportReport)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, importReportLimit);

  return {
    generatedAt: now.toISOString(),
    source: 'local-backup',
    oddsWindow: null,
    matches,
    scoreOddsByMatch: mapScoreOddsByMatch(matches, tables.score_odds || [], tables.score_odds_trends || []),
    aiRecommendationsByMatch: mapAiRecommendationsByMatch(tables.ai_recommendations || []),
    aiStrategyStats: mapStaticAiStrategyStats(tables.ai_strategy_stats || []),
    importReports,
  };
}

export function buildStaticGroupSnapshotsFromBackupTables({ tables, now = new Date() }) {
  const generatedAt = now.toISOString();
  const groups = Array.isArray(tables.groups) ? tables.groups : [];
  const players = Array.isArray(tables.players) ? tables.players : [];
  const predictions = Array.isArray(tables.predictions) ? tables.predictions : [];
  const snapshots = {};

  for (const groupRow of groups) {
    if (!groupRow?.id || !groupRow?.code) continue;
    const groupPlayers = players
      .filter((player) => player.group_id === groupRow.id && player.id && player.name)
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
      .map((player) => ({
        id: player.id,
        name: player.name,
      }));
    const playerIds = new Set(groupPlayers.map((player) => player.id));
    const groupPredictions = predictions
      .filter((prediction) => (
        prediction.group_id === groupRow.id
        && playerIds.has(prediction.player_id)
        && prediction.match_id
      ))
      .map((prediction) => ({
        player_id: prediction.player_id,
        match_id: prediction.match_id,
        scores: Array.isArray(prediction.scores)
          ? prediction.scores.filter((score) => typeof score === 'string')
          : [],
      }));

    snapshots[groupRow.code] = {
      generatedAt,
      source: 'local-backup',
      group: {
        id: groupRow.id,
        code: groupRow.code,
        name: groupRow.name || groupRow.code,
      },
      players: groupPlayers,
      predictions: groupPredictions,
    };
  }

  return snapshots;
}

export function getStaticAiStrategyStatsPage(rows, { page = 0, pageSize = 6 } = {}) {
  const safePage = Math.max(0, Number(page) || 0);
  const safePageSize = Math.max(1, Number(pageSize) || 6);
  const sortedRows = [...(rows || [])].sort((a, b) => Number(b.roi || 0) - Number(a.roi || 0));
  const from = safePage * safePageSize;
  return {
    rows: sortedRows.slice(from, from + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    hasNext: sortedRows.length > from + safePageSize,
  };
}

function mapStaticAiStrategyStats(rows) {
  return (rows || [])
    .map((row) => ({
      strategyId: row.strategy_id,
      strategyName: row.strategy_name || '',
      matchesCount: Number(row.matches_count) || 0,
      cost: Number(row.cost) || 0,
      revenue: Number(row.revenue) || 0,
      profit: Number(row.profit) || 0,
      roi: Number(row.roi) || 0,
      updatedAt: row.updated_at || '',
    }))
    .sort((a, b) => b.roi - a.roi);
}

function toAppImportReport(row) {
  return {
    id: row.id,
    jobName: row.job_name,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    rowsWritten: row.rows_written,
    itemsSeen: row.items_seen,
    message: row.message || '',
    errorDetail: row.error_detail || '',
    runUrl: row.run_url || '',
    createdAt: row.created_at,
  };
}
