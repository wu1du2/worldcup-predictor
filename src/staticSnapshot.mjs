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
import { getFlagshipStrategyRank, isFlagshipStrategy } from './flagshipStrategies.mjs';
import { toAppMatch } from './matchSchedule.mjs';
import { normalizeD1AdvancementPredictions } from './d1Data.mjs';
import { normalizeHandicapChallengePayload } from './handicapChallenge.mjs';
import { normalizeChampionRoadPayload } from './championRoad.mjs';

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
    archiveMode: Boolean(snapshot.archiveMode),
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
    advancement: normalizeD1AdvancementPredictions(snapshot.advancement || {}),
    handicapChallenge: normalizeHandicapChallengePayload(snapshot.handicapChallenge || {}),
    championRoad: normalizeChampionRoadPayload(snapshot.championRoad || {}),
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

export function buildStaticSnapshotFromBackupTables({
  tables,
  now = new Date(),
  importReportLimit = 20,
  archiveMode = false,
}) {
  const matches = (tables.matches || [])
    .filter((row) => row.active !== false && Number(row.active ?? 1) !== 0)
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
    archiveMode,
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
  const matches = Array.isArray(tables.matches) ? tables.matches : [];
  const advancementPredictions = Array.isArray(tables.advancement_predictions) ? tables.advancement_predictions : [];
  const handicapMatches = buildStaticHandicapMatches(tables.handicap_challenge_matches, matches);
  const handicapPredictions = Array.isArray(tables.handicap_challenge_predictions) ? tables.handicap_challenge_predictions : [];
  const championPredictions = Array.isArray(tables.champion_road_predictions) ? tables.champion_road_predictions : [];
  const advancementTies = buildStaticAdvancementTies(matches);
  const allMatchesAsAdvancementTies = buildStaticAdvancementTies(matches, { stages: null });
  const championRoad = buildStaticChampionRoad(matches);
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
        scores: parseTextArray(prediction.scores),
      }));
    const groupAdvancementPredictions = advancementPredictions
      .filter((row) => row.group_id === groupRow.id && playerIds.has(row.player_id))
      .map((row) => ({
        playerId: row.player_id,
        matchId: row.match_id,
        winnerSide: row.winner_side,
        winnerName: row.winner_name || '',
      }));
    const predictedAdvancementMatchIds = new Set(groupAdvancementPredictions.map((row) => row.matchId));
    const groupAdvancementTies = predictedAdvancementMatchIds.size
      ? allMatchesAsAdvancementTies.filter((tie) => predictedAdvancementMatchIds.has(tie.matchId))
      : advancementTies;
    const groupHandicapPredictions = handicapPredictions
      .filter((row) => row.group_id === groupRow.id && playerIds.has(row.player_id))
      .map((row) => ({
        playerId: row.player_id,
        matchId: row.match_id,
        choiceKey: row.choice_key,
      }));
    const groupChampionPredictions = championPredictions
      .filter((row) => row.group_id === groupRow.id && playerIds.has(row.player_id))
      .map((row) => ({
        playerId: row.player_id,
        ranking: parseTextArray(row.ranking),
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
      advancement: {
        ties: groupAdvancementTies,
        predictions: groupAdvancementPredictions,
      },
      handicapChallenge: {
        matches: handicapMatches,
        predictions: groupHandicapPredictions,
      },
      championRoad: {
        ...championRoad,
        predictions: groupChampionPredictions,
      },
    };
  }

  return snapshots;
}

function buildStaticAdvancementTies(matches, { stages = ['Quarterfinals', 'Quarterfinal'] } = {}) {
  return matches
    .filter((row) => Number(row.active ?? 1) !== 0 && (!stages || stages.includes(row.stage)))
    .sort(compareMatchRows)
    .map((row) => ({
      matchId: row.match_code,
      date: row.match_date_cn || '',
      time: row.time_cn || '',
      kickoffAtUtc: row.kickoff_at_utc || '',
      home: row.home_cn || row.home || '',
      away: row.away_cn || row.away || '',
      homeScore: normalizeNullableInteger(row.home_score),
      awayScore: normalizeNullableInteger(row.away_score),
      winnerName: inferKnockoutWinnerName(row, matches),
      status: row.status || 'pre',
      locked: true,
    }));
}

function inferKnockoutWinnerName(row, matches) {
  if (row.status !== 'post') return '';
  const home = String(row.home_cn || row.home || '').trim();
  const away = String(row.away_cn || row.away || '').trim();
  const homeScore = normalizeNullableInteger(row.home_score);
  const awayScore = normalizeNullableInteger(row.away_score);
  if (Number.isInteger(homeScore) && Number.isInteger(awayScore) && homeScore !== awayScore) {
    return homeScore > awayScore ? home : away;
  }

  const nextStages = {
    'Round of 32': ['Round of 16'],
    'Round of 16': ['Quarterfinals', 'Quarterfinal'],
    Quarterfinals: ['Semifinals', 'Semifinal'],
    Quarterfinal: ['Semifinals', 'Semifinal'],
  }[row.stage] || [];
  if (!nextStages.length) return '';
  const nextRoundTeams = new Set(matches
    .filter((match) => Number(match.active ?? 1) !== 0 && nextStages.includes(match.stage))
    .flatMap((match) => [match.home_cn || match.home, match.away_cn || match.away])
    .map((name) => String(name || '').trim())
    .filter(Boolean));
  const homeAdvanced = nextRoundTeams.has(home);
  const awayAdvanced = nextRoundTeams.has(away);
  if (homeAdvanced === awayAdvanced) return '';
  return homeAdvanced ? home : away;
}

function buildStaticHandicapMatches(rows, matches) {
  const matchesByCode = new Map(matches.map((row) => [row.match_code, row]));
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => Number(row.active ?? 1) !== 0)
    .sort(compareMatchRows)
    .map((row) => {
      const result = matchesByCode.get(row.match_code) || {};
      return {
        matchId: row.match_id,
        matchCode: row.match_code || '',
        issue: row.issue || '',
        date: row.date_cn || '',
        time: row.time_cn || '',
        kickoffAtUtc: row.kickoff_at_utc || '',
        home: row.home_cn || '',
        away: row.away_cn || '',
        handicap: Number(row.handicap),
        odds: {
          win: Number(row.odds_win),
          draw: Number(row.odds_draw),
          loss: Number(row.odds_loss),
        },
        probabilities: {
          win: Number(row.probability_win),
          draw: Number(row.probability_draw),
          loss: Number(row.probability_loss),
        },
        homeScore: normalizeNullableInteger(result.settlement_home_score ?? result.home_score),
        awayScore: normalizeNullableInteger(result.settlement_away_score ?? result.away_score),
        status: result.status || 'pre',
        locked: true,
      };
    });
}

function buildStaticChampionRoad(matches) {
  const semifinalRows = matches
    .filter((row) => Number(row.active ?? 1) !== 0 && ['Semifinals', 'Semifinal'].includes(row.stage))
    .sort(compareMatchRows);
  const teams = [];
  const seen = new Set();
  for (const row of semifinalRows) {
    for (const name of [row.home_cn || row.home, row.away_cn || row.away]) {
      const teamName = String(name || '').trim();
      if (!teamName || seen.has(teamName)) continue;
      seen.add(teamName);
      teams.push({ teamKey: teamName, name: teamName });
    }
  }
  const firstKickoffAtUtc = semifinalRows.map((row) => row.kickoff_at_utc).filter(Boolean).sort()[0] || '';
  const firstKickoffMs = Date.parse(firstKickoffAtUtc);
  return {
    teams: teams.slice(0, 4),
    locked: true,
    lockAtUtc: Number.isFinite(firstKickoffMs) ? new Date(firstKickoffMs - 15 * 60 * 1000).toISOString() : '',
  };
}

function compareMatchRows(left, right) {
  return `${left.match_date_cn || left.date_cn || ''} ${left.time_cn || ''}`
    .localeCompare(`${right.match_date_cn || right.date_cn || ''} ${right.time_cn || ''}`);
}

function parseTextArray(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function normalizeNullableInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

export function getStaticAiStrategyStatsPage(rows, { page = 0, pageSize = 6 } = {}) {
  const safePage = Math.max(0, Number(page) || 0);
  const safePageSize = Math.max(1, Number(pageSize) || 6);
  const sortedRows = sortAiStrategyStatsForUi(rows || []);
  const from = safePage * safePageSize;
  return {
    rows: sortedRows.slice(from, from + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    hasNext: sortedRows.length > from + safePageSize,
  };
}

export function sortAiStrategyStatsForUi(rows) {
  return [...(rows || [])].sort(compareAiStrategyStatsForUi);
}

function compareAiStrategyStatsForUi(a, b) {
  const aFlagship = isFlagshipStrategy(a.strategyId);
  const bFlagship = isFlagshipStrategy(b.strategyId);
  if (aFlagship || bFlagship) {
    if (aFlagship && bFlagship) return getFlagshipStrategyRank(a.strategyId) - getFlagshipStrategyRank(b.strategyId);
    return aFlagship ? -1 : 1;
  }
  return Number(b.roi || 0) - Number(a.roi || 0);
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
    .sort(compareAiStrategyStatsForUi);
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
