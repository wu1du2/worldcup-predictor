const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        return json({ ok: true });
      }

      if (request.method === 'GET' && url.pathname === '/api/live-board') {
        return json(await loadLiveBoard(env.DB, {
          from: url.searchParams.get('from'),
          to: url.searchParams.get('to'),
        }));
      }

      const groupStateMatch = url.pathname.match(/^\/api\/groups\/([^/]+)\/state$/);
      if (request.method === 'GET' && groupStateMatch) {
        return json(await loadGroupState(env.DB, decodeURIComponent(groupStateMatch[1])));
      }

      const groupPlayerMatch = url.pathname.match(/^\/api\/groups\/([^/]+)\/players$/);
      if (request.method === 'POST' && groupPlayerMatch) {
        const payload = await readJsonBody(request);
        return json(await createGroupPlayer(env.DB, decodeURIComponent(groupPlayerMatch[1]), payload?.name));
      }

      const groupPredictionMatch = url.pathname.match(/^\/api\/groups\/([^/]+)\/predictions$/);
      if (request.method === 'POST' && groupPredictionMatch) {
        const payload = await readJsonBody(request);
        return json(await saveGroupPredictions(env.DB, decodeURIComponent(groupPredictionMatch[1]), payload));
      }

      return json({ error: 'not_found' }, { status: 404 });
    } catch (error) {
      if (error?.status) {
        return json({ error: error.code || 'bad_request', message: error.message || '' }, { status: error.status });
      }
      return json({ error: 'internal_error', message: error?.message || 'Worker error' }, { status: 500 });
    }
  },
};

export async function loadGroupState(db, groupCode) {
  const { group, created } = await getOrCreateGroup(db, groupCode);
  if (created) await ensureAiPlayer(db, group.id);

  const playersResult = await db
    .prepare('select id, name, created_at from players where group_id = ? order by created_at asc, name asc')
    .bind(group.id)
    .all();
  const predictionsResult = await db
    .prepare('select player_id, match_id, scores from predictions where group_id = ?')
    .bind(group.id)
    .all();

  return {
    group: {
      id: group.id,
      code: group.code,
      name: group.name || group.code,
    },
    players: (playersResult.results || [])
      .map((player) => ({
        id: player.id,
        name: player.name,
        created_at: player.created_at || '',
      }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.name.localeCompare(b.name))
      .map((player) => ({
        id: player.id,
        name: player.name,
      })),
    predictions: (predictionsResult.results || []).map((prediction) => ({
      player_id: prediction.player_id,
      match_id: prediction.match_id,
      scores: parseScoreList(prediction.scores),
    })),
  };
}

export async function createGroupPlayer(db, groupCode, name) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw httpError(400, 'invalid_player_name', 'Player name is required');

  const { group } = await getOrCreateGroup(db, groupCode);
  await ensureAiPlayer(db, group.id);
  const player = await findOrCreatePlayer(db, group.id, trimmedName);

  return {
    group,
    player: {
      id: player.id,
      name: player.name,
    },
  };
}

export async function saveGroupPredictions(db, groupCode, payload) {
  const { group } = await getOrCreateGroup(db, groupCode);
  const playerId = String(payload?.playerId || '').trim();
  if (!playerId) throw httpError(400, 'invalid_player', 'Player is required');

  const player = await db
    .prepare('select id, name from players where id = ? and group_id = ? limit 1')
    .bind(playerId, group.id)
    .first();
  if (!player) throw httpError(404, 'player_not_found', 'Player not found');

  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const updatedAt = new Date().toISOString();
  let rowsWritten = 0;

  for (const entry of entries) {
    const matchId = String(entry?.matchId || '').trim();
    if (!matchId) continue;
    const scores = normalizeScores(entry?.scores);
    await db
      .prepare(`
        insert into predictions (id, group_id, player_id, match_id, scores, updated_at)
        values (?, ?, ?, ?, ?, ?)
        on conflict(group_id, player_id, match_id)
        do update set scores = excluded.scores, updated_at = excluded.updated_at
      `)
      .bind(randomId(), group.id, player.id, matchId, JSON.stringify(scores), updatedAt)
      .run();
    rowsWritten += 1;
  }

  return { ok: true, rowsWritten };
}

export async function loadLiveBoard(db, { from, to } = {}) {
  const window = normalizeLiveWindow({ from, to });
  const matchesResult = await db
    .prepare(`
      select match_code, match_date_cn, time_cn, home, away, home_cn, away_cn,
        home_score, away_score, status, status_detail, stage
      from matches
      where active = 1 and match_date_cn >= ? and match_date_cn <= ?
      order by match_date_cn asc, time_cn asc
    `)
    .bind(window.from, window.to)
    .all();
  const matches = (matchesResult.results || []).map(toAppMatch);

  const oddsWindow = {
    from: `${window.from}T00:00:00+08:00`,
    to: `${addChinaDateDays(window.to, 1)}T00:00:00+08:00`,
  };
  const [oddsResult, trendResult, recommendationsResult, strategyStatsResult, reportsResult] = await Promise.all([
    db
      .prepare(`
        select home, away, kickoff_label, score, odds
        from score_odds
        where kickoff_at_cn >= ? and kickoff_at_cn < ?
        order by kickoff_at_cn asc, score asc
      `)
      .bind(oddsWindow.from, oddsWindow.to)
      .all(),
    db
      .prepare(`
        select home, away, kickoff_label, score, first_odds, latest_odds, change_pct, snapshots_count
        from score_odds_trends
        where kickoff_at_cn >= ? and kickoff_at_cn < ?
        order by kickoff_at_cn asc, score asc
      `)
      .bind(oddsWindow.from, oddsWindow.to)
      .all(),
    loadAiRecommendationsForMatches(db, matches.map((match) => match.id)),
    db
      .prepare(`
        select strategy_id, strategy_name, matches_count, cost, revenue, profit, roi, updated_at
        from ai_strategy_stats
        order by roi desc
        limit 50
      `)
      .all(),
    db
      .prepare(`
        select id, job_name, status, started_at, finished_at, rows_written, items_seen,
          message, error_detail, run_url, created_at
        from import_reports
        order by created_at desc
        limit 8
      `)
      .all(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    window,
    matches,
    scoreOddsByMatch: mapScoreOddsByMatch(matches, oddsResult.results || [], trendResult.results || []),
    aiRecommendationsByMatch: mapAiRecommendationsByMatch(recommendationsResult.results || []),
    aiStrategyStats: (strategyStatsResult.results || []).map(toAppAiStrategyStat),
    importReports: (reportsResult.results || []).map(toAppImportReport),
  };
}

async function loadAiRecommendationsForMatches(db, matchIds) {
  const ids = matchIds.filter(Boolean);
  if (!ids.length) return { results: [] };
  const placeholders = ids.map(() => '?').join(',');
  return db
    .prepare(`
      select match_id, scores, score_labels, strategy_id, strategy_name, strategy_roi,
        strategy_roi_label, strategy_feature, router_reason, match_reason_summary,
        match_reason_detail, prediction_summary, prediction_run_id, predicted_at
      from ai_recommendations
      where match_id in (${placeholders})
    `)
    .bind(...ids)
    .all();
}

async function getOrCreateGroup(db, groupCode) {
  const code = String(groupCode || '').trim();
  if (!code) throw httpError(400, 'invalid_group', 'Group code is required');

  const existing = await db
    .prepare('select id, code, name from groups where code = ? limit 1')
    .bind(code)
    .first();
  if (existing) return { group: normalizeGroup(existing), created: false };

  const now = new Date().toISOString();
  const group = { id: randomId(), code, name: code };
  await db
    .prepare(`
      insert into groups (id, code, name, created_at)
      values (?, ?, ?, ?)
      on conflict(code) do nothing
    `)
    .bind(group.id, group.code, group.name, now)
    .run();

  const saved = await db
    .prepare('select id, code, name from groups where code = ? limit 1')
    .bind(code)
    .first();
  return { group: normalizeGroup(saved || group), created: true };
}

async function ensureAiPlayer(db, groupId) {
  return findOrCreatePlayer(db, groupId, 'AI推荐');
}

async function findOrCreatePlayer(db, groupId, name) {
  const existing = await db
    .prepare('select id, name from players where group_id = ? and name = ? limit 1')
    .bind(groupId, name)
    .first();
  if (existing) return existing;

  const player = { id: randomId(), name };
  await db
    .prepare(`
      insert into players (id, group_id, name, created_at)
      values (?, ?, ?, ?)
      on conflict(group_id, name) do nothing
    `)
    .bind(player.id, groupId, player.name, new Date().toISOString())
    .run();

  return await db
    .prepare('select id, name from players where group_id = ? and name = ? limit 1')
    .bind(groupId, name)
    .first() || player;
}

function normalizeGroup(group) {
  return {
    id: group.id,
    code: group.code,
    name: group.name || group.code,
  };
}

function normalizeLiveWindow({ from, to } = {}) {
  const today = getChinaDate(new Date());
  const safeFrom = isDateOnly(from) ? from : today;
  const safeTo = isDateOnly(to) && to >= safeFrom ? to : addChinaDateDays(safeFrom, 2);
  return { from: safeFrom, to: safeTo };
}

function toAppMatch(row) {
  return {
    id: row.match_code,
    matchCode: row.match_code,
    date: row.match_date_cn,
    time: row.time_cn,
    home: row.home_cn || row.home,
    away: row.away_cn || row.away,
    homeScore: Number.isInteger(row.home_score) ? row.home_score : normalizeNullableInteger(row.home_score),
    awayScore: Number.isInteger(row.away_score) ? row.away_score : normalizeNullableInteger(row.away_score),
    status: row.status || 'pre',
    statusDetail: row.status_detail || '',
    venue: '',
    stage: row.stage || '',
  };
}

function mapScoreOddsByMatch(matches, oddsRows, trendRows) {
  const rowsByMatchKey = new Map();
  const trendsByScoreKey = new Map();

  for (const row of oddsRows || []) {
    const key = buildOddsMatchKey(row.home, row.away, row.kickoff_label);
    rowsByMatchKey.set(key, [...(rowsByMatchKey.get(key) || []), row]);
  }

  for (const row of trendRows || []) {
    const key = buildOddsMatchKey(row.home, row.away, row.kickoff_label);
    trendsByScoreKey.set(`${key}|${row.score}`, {
      firstOdds: Number(row.first_odds),
      latestOdds: Number(row.latest_odds),
      changePct: Number(row.change_pct),
      snapshotsCount: Number(row.snapshots_count) || 0,
    });
  }

  const oddsByMatchId = {};
  for (const match of matches || []) {
    const key = buildOddsMatchKey(match.home, match.away, `${String(match.date || '').slice(5)} ${match.time}`);
    const options = (rowsByMatchKey.get(key) || []).map((row) => {
      const option = { score: row.score, odds: Number(row.odds) };
      const trend = trendsByScoreKey.get(`${key}|${row.score}`);
      if (trend) option.trend = trend;
      return option;
    });
    if (options.length) oddsByMatchId[match.id] = options;
  }
  return oddsByMatchId;
}

function mapAiRecommendationsByMatch(rows) {
  const recommendations = {};
  for (const row of rows || []) {
    if (!row.match_id) continue;
    recommendations[row.match_id] = {
      matchId: row.match_id,
      scores: parseScoreList(row.scores),
      scoreLabels: parseScoreList(row.score_labels),
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

function buildOddsMatchKey(home, away, kickoffLabel) {
  return `${home}|${away}|${kickoffLabel}`;
}

function parseScoreList(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((score) => typeof score === 'string') : [];
  } catch {
    return [];
  }
}

function normalizeNullableInteger(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function getChinaDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addChinaDateDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return getChinaDate(date);
}

function normalizeScores(scores) {
  return Array.isArray(scores) ? scores.filter((score) => typeof score === 'string') : [];
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    throw httpError(400, 'invalid_json', 'Request body must be JSON');
  }
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function randomId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function json(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json; charset=utf-8',
    },
  });
}
