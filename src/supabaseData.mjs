import { createClient } from '@supabase/supabase-js';

import { toAppMatch } from './matchSchedule.mjs';
import { sportteryScoreTemplate } from './scoreTemplate.mjs';

export const aiPlayerName = 'AI推荐';
export const supabaseFetchTimeoutMs = 8000;
export const supabaseFetchRetries = 1;

export function createSupabaseBrowserClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey, {
    global: {
      fetch: (input, init) => fetchWithTimeoutAndRetry(input, init, {
        timeoutMs: supabaseFetchTimeoutMs,
        retries: supabaseFetchRetries,
      }),
    },
  });
}

export async function fetchWithTimeoutAndRetry(input, init = {}, {
  timeoutMs = supabaseFetchTimeoutMs,
  retries = supabaseFetchRetries,
  fetchImpl = fetch,
} = {}) {
  const method = String(init?.method || input?.method || 'GET').toUpperCase();
  const maxRetries = method === 'GET' || method === 'HEAD' ? Math.max(0, retries) : 0;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const abortFromParent = () => controller.abort(init.signal?.reason);
    if (init.signal?.aborted) abortFromParent();
    init.signal?.addEventListener?.('abort', abortFromParent, { once: true });
    const timeoutId = setTimeout(() => controller.abort(new Error('Supabase request timed out')), timeoutMs);

    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || init.signal?.aborted) throw error;
    } finally {
      clearTimeout(timeoutId);
      init.signal?.removeEventListener?.('abort', abortFromParent);
    }
  }

  throw lastError;
}

export function getGroupCodeFromSearch(search) {
  const params = new URLSearchParams(search);
  if (!params.has('group')) return null;
  const code = params.get('group')?.trim();
  return code || 'default';
}

export function generateGroupCode(random = Math.random) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(random() * alphabet.length)];
  }
  return code;
}

export function buildFutureScoreOddsWindow(now = new Date(), daysAhead = 3) {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now).split('-').map(Number);
  const [year, month, day] = dateParts;
  const startUtc = Date.UTC(year, month - 1, day) - (8 * 60 * 60 * 1000);
  const endUtc = startUtc + ((Number(daysAhead) + 1) * 24 * 60 * 60 * 1000);
  return {
    from: formatChinaOffsetIso(new Date(startUtc)),
    to: formatChinaOffsetIso(new Date(endUtc)),
  };
}

function formatChinaOffsetIso(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}

export function mergePlayers(dbPlayers) {
  const players = dbPlayers || [];
  const aiPlayer = players.find((player) => player.name === aiPlayerName);
  const regularPlayers = players.filter((player) => player.name !== aiPlayerName);

  return [
    { ...(aiPlayer || { id: 'ai-player', name: aiPlayerName }), isAi: true },
    ...regularPlayers,
  ];
}

export function mapPredictionsByPlayer(rows) {
  const predictions = {};

  for (const row of rows) {
    predictions[row.player_id] ||= {};
    predictions[row.player_id][row.match_id] = normalizeScores(row.scores);
  }

  return predictions;
}

function normalizeScores(scores) {
  return Array.isArray(scores) ? scores.filter((score) => typeof score === 'string') : [];
}

export async function loadMatches({ client }) {
  const selectWithSettlement = 'id,match_code,kickoff_at_utc,match_date_cn,time_cn,home,away,home_cn,away_cn,home_score,away_score,settlement_home_score,settlement_away_score,settlement_score_source,status,status_detail,venue,stage,home_team:teams!matches_home_team_id_fkey(name_en,name_cn),away_team:teams!matches_away_team_id_fkey(name_en,name_cn)';
  const selectLegacy = 'id,match_code,kickoff_at_utc,match_date_cn,time_cn,home,away,home_cn,away_cn,home_score,away_score,status,status_detail,venue,stage,home_team:teams!matches_home_team_id_fkey(name_en,name_cn),away_team:teams!matches_away_team_id_fkey(name_en,name_cn)';
  let { data, error } = await client
    .from('matches')
    .select(selectWithSettlement)
    .eq('active', true)
    .order('kickoff_at_utc', { ascending: true });

  if (isMissingSettlementColumnError(error)) {
    ({ data, error } = await client
      .from('matches')
      .select(selectLegacy)
      .eq('active', true)
      .order('kickoff_at_utc', { ascending: true }));
  }

  if (error) throw error;
  return (data || []).filter(isCompleteMatchRow).map(toAppMatch);
}

function isMissingSettlementColumnError(error) {
  return /settlement_(home|away)_score|settlement_score_source/.test(String(error?.message || error?.details || ''));
}

export async function loadScoreOdds({ client, matches, oddsWindow = null }) {
  const [rowsResult, trendRowsResult] = await Promise.allSettled([
    loadAllScoreOddsRows(client, oddsWindow),
    loadAllScoreOddsTrendRows(client, oddsWindow),
  ]);
  if (rowsResult.status === 'rejected') throw rowsResult.reason;
  if (trendRowsResult.status === 'rejected') {
    console.warn('Failed to load score odds trends', trendRowsResult.reason);
  }
  const rows = rowsResult.value;
  const trendRows = trendRowsResult.status === 'fulfilled' ? trendRowsResult.value : [];
  return mapScoreOddsByMatch(matches, rows, trendRows);
}

export async function loadImportReports({ client, limit = 8 }) {
  const { data, error } = await client
    .from('import_reports')
    .select('id,job_name,status,started_at,finished_at,rows_written,items_seen,message,error_detail,run_url,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).map(toAppImportReport);
}

export async function loadAiRecommendations({ client }) {
  const { data, error } = await client
    .from('ai_recommendations')
    .select('match_id,scores,score_labels,strategy_id,strategy_name,strategy_roi,strategy_roi_label,strategy_feature,router_reason,match_reason_summary,match_reason_detail,prediction_summary,prediction_run_id,predicted_at')
    .order('predicted_at', { ascending: false });

  if (error) throw error;
  return mapAiRecommendationsByMatch(data || []);
}

export function mapAiRecommendationsByMatch(rows) {
  const recommendations = {};

  for (const row of rows || []) {
    if (!row?.match_id) continue;
    recommendations[row.match_id] = {
      matchId: row.match_id,
      scores: normalizeScores(row.scores),
      scoreLabels: normalizeScores(row.score_labels),
      strategyId: row.strategy_id || '',
      strategyName: row.strategy_name || '',
      strategyRoi: Number.isFinite(Number(row.strategy_roi)) ? Number(row.strategy_roi) : null,
      roiLabel: row.strategy_roi_label || '',
      strategyFeature: row.strategy_feature || '',
      routerReason: row.router_reason || '',
      matchReasonSummary: row.match_reason_summary || '',
      matchReasonDetail: row.match_reason_detail || '',
      predictionSummary: row.prediction_summary || '',
      predictionRunId: row.prediction_run_id || '',
      predictedAt: row.predicted_at || '',
    };
  }

  return recommendations;
}

export async function submitAiUserStrategy({
  client,
  groupCode,
  authorName,
  strategyName,
  strategyPrompt,
}) {
  const trimmedStrategyName = String(strategyName || '').trim();
  const trimmedPrompt = String(strategyPrompt || '').trim();
  if (!trimmedStrategyName) throw new Error('策略名不能为空');
  if (!trimmedPrompt) throw new Error('策略内容不能为空');

  const row = {
    group_code: String(groupCode || '').trim() || null,
    author_name: String(authorName || '').trim() || '匿名',
    strategy_name: trimmedStrategyName,
    strategy_prompt: trimmedPrompt,
    status: 'pending',
  };

  const { data, error } = await client
    .from('ai_user_strategies')
    .insert(row)
    .select('id,group_code,author_name,strategy_name,strategy_prompt,status,created_at')
    .single();

  if (error) throw error;
  return data;
}

export async function loadAiStrategyStats({ client, page = 0, pageSize = 6 }) {
  const safePage = Math.max(0, Number(page) || 0);
  const safePageSize = Math.max(1, Number(pageSize) || 6);
  const from = safePage * safePageSize;
  const to = from + safePageSize;

  const { data, error } = await client
    .from('ai_strategy_stats')
    .select('strategy_id,strategy_name,matches_count,cost,revenue,profit,roi,updated_at')
    .order('roi', { ascending: false })
    .range(from, to);

  if (error) throw error;
  const rows = (data || []).slice(0, safePageSize).map(toAppAiStrategyStat);
  return {
    rows,
    page: safePage,
    pageSize: safePageSize,
    hasNext: (data || []).length > safePageSize,
  };
}

function toAppAiStrategyStat(row) {
  return {
    strategyId: row.strategy_id,
    strategyName: row.strategy_name || '',
    matchesCount: Number(row.matches_count) || 0,
    cost: Number(row.cost) || 0,
    revenue: Number(row.revenue) || 0,
    profit: Number(row.profit) || 0,
    roi: Number(row.roi) || 0,
    updatedAt: row.updated_at || '',
  };
}

export async function upsertAiRecommendations({ client, rows }) {
  if (!rows?.length) return;

  const { error } = await client
    .from('ai_recommendations')
    .upsert(rows, { onConflict: 'match_id' });

  if (error) throw error;
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

async function loadAllScoreOddsRows(client, oddsWindow = null) {
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    let query = client
      .from('score_odds')
      .select('home,away,kickoff_label,score,odds')
    if (oddsWindow?.from && oddsWindow?.to) {
      query = query
        .gte('kickoff_at_cn', oddsWindow.from)
        .lt('kickoff_at_cn', oddsWindow.to)
        .order('kickoff_at_cn', { ascending: true });
    } else {
      query = query.order('source_match_key', { ascending: true });
    }
    const { data, error } = await query
      .order('score', { ascending: true })
      .range(from, from + pageSize - 1);

    if (isMissingKickoffAtColumn(error) && oddsWindow) return loadAllScoreOddsRows(client, null);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

async function loadAllScoreOddsTrendRows(client, oddsWindow = null) {
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    let query = client
      .from('score_odds_trends')
      .select('home,away,kickoff_label,score,first_odds,latest_odds,change_pct,snapshots_count')
    if (oddsWindow?.from && oddsWindow?.to) {
      query = query
        .gte('kickoff_at_cn', oddsWindow.from)
        .lt('kickoff_at_cn', oddsWindow.to)
        .order('kickoff_at_cn', { ascending: true });
    } else {
      query = query.order('source_match_key', { ascending: true });
    }
    const { data, error } = await query
      .order('score', { ascending: true })
      .range(from, from + pageSize - 1);

    if (isMissingKickoffAtColumn(error) && oddsWindow) return loadAllScoreOddsTrendRows(client, null);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

function isMissingKickoffAtColumn(error) {
  return error?.code === '42703' || /kickoff_at_cn/i.test(error?.message || '');
}

export function mapScoreOddsByMatch(matches, oddsRows, trendRows = []) {
  const rowsByMatchKey = new Map();
  const trendsByScoreKey = new Map();

  for (const row of oddsRows || []) {
    const key = buildOddsMatchKey(row.home, row.away, row.kickoff_label);
    rowsByMatchKey.set(key, [...(rowsByMatchKey.get(key) || []), row]);
  }

  for (const row of trendRows || []) {
    if (!row.home || !row.away || !row.kickoff_label || !row.score) continue;
    const matchKey = buildOddsMatchKey(row.home, row.away, row.kickoff_label);
    trendsByScoreKey.set(`${matchKey}|${row.score}`, {
      firstOdds: Number(row.first_odds),
      latestOdds: Number(row.latest_odds),
      changePct: Number(row.change_pct),
      snapshotsCount: row.snapshots_count,
    });
  }

  const oddsByMatchId = {};

  for (const match of matches || []) {
    const kickoffLabel = `${match.date.slice(5)} ${match.time}`;
    const key = buildOddsMatchKey(match.home, match.away, kickoffLabel);
    const rows = rowsByMatchKey.get(key) || [];
    if (!rows.length) continue;

    oddsByMatchId[match.id] = rows
      .map((row) => {
        const option = {
          score: row.score,
          odds: Number(row.odds),
        };
        const trend = trendsByScoreKey.get(`${key}|${row.score}`);
        if (trend) option.trend = trend;
        return option;
      })
      .sort(compareScoreOptions);
  }

  return oddsByMatchId;
}

function isCompleteMatchRow(row) {
  return Boolean(row.match_code && row.match_date_cn && row.time_cn && row.home && row.away);
}

export async function loadGroupState({ client, groupCode }) {
  const group = await findOrCreateGroup(client, groupCode);
  await ensureAiPlayer({ client, groupId: group.id });

  const [{ data: players, error: playersError }, { data: predictions, error: predictionsError }] = await Promise.all([
    client.from('players').select('id,name').eq('group_id', group.id).order('created_at', { ascending: true }),
    client.from('predictions').select('player_id,match_id,scores').eq('group_id', group.id),
  ]);

  if (playersError) throw playersError;
  if (predictionsError) throw predictionsError;

  return {
    group,
    players: mergePlayers(players || []),
    predictions: mapPredictionsByPlayer(predictions || []),
  };
}

export async function ensureAiPlayer({ client, groupId }) {
  const { data: existing, error: existingError } = await client
    .from('players')
    .select('id,name')
    .eq('group_id', groupId)
    .eq('name', aiPlayerName)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await client
    .from('players')
    .insert({ group_id: groupId, name: aiPlayerName })
    .select('id,name')
    .single();

  if (error) throw error;
  return data;
}

export async function createGroupPlayer({ client, groupId, name }) {
  const trimmedName = name.trim();
  if (!trimmedName) return null;

  const { data: existing, error: existingError } = await client
    .from('players')
    .select('id,name')
    .eq('group_id', groupId)
    .eq('name', trimmedName)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await client
    .from('players')
    .insert({ group_id: groupId, name: trimmedName })
    .select('id,name')
    .single();

  if (error) throw error;
  return data;
}

export async function saveGroupPredictions({ client, groupId, playerId, entries }) {
  if (!entries.length) return;

  const rows = entries.map((entry) => ({
    group_id: groupId,
    player_id: playerId,
    match_id: entry.matchId,
    scores: entry.scores,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await client
    .from('predictions')
    .upsert(rows, { onConflict: 'group_id,player_id,match_id' });

  if (error) throw error;
}

async function findOrCreateGroup(client, groupCode) {
  return getGroupByCode({ client, groupCode });
}

export async function getGroupByCode({ client, groupCode }) {
  const { data: existing, error: existingError } = await client
    .from('groups')
    .select('id,code,name')
    .eq('code', groupCode)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await client
    .from('groups')
    .insert({ code: groupCode, name: groupCode })
    .select('id,code,name')
    .single();

  if (error) throw error;
  return data;
}

function buildOddsMatchKey(home, away, kickoffLabel) {
  return `${home}|${away}|${kickoffLabel}`;
}

function compareScoreOptions(a, b) {
  return getScoreOrder(a.score) - getScoreOrder(b.score) || a.score.localeCompare(b.score);
}

function getScoreOrder(score) {
  const index = sportteryScoreTemplate.indexOf(score);
  return index === -1 ? sportteryScoreTemplate.length : index;
}
