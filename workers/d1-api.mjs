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

      const groupAdvancementMatch = url.pathname.match(/^\/api\/groups\/([^/]+)\/advancement-predictions$/);
      if (groupAdvancementMatch) {
        const groupCode = decodeURIComponent(groupAdvancementMatch[1]);
        if (request.method === 'GET') {
          return json(await loadAdvancementPredictions(env.DB, groupCode, { now: getNow(env) }));
        }
        if (request.method === 'POST') {
          const payload = await readJsonBody(request);
          return json(await saveAdvancementPredictions(env.DB, groupCode, payload, { now: getNow(env) }));
        }
      }

      const groupHandicapMatch = url.pathname.match(/^\/api\/groups\/([^/]+)\/handicap-challenge$/);
      if (groupHandicapMatch) {
        const groupCode = decodeURIComponent(groupHandicapMatch[1]);
        if (request.method === 'GET') {
          return json(await loadHandicapChallenge(env.DB, groupCode, { now: getNow(env) }));
        }
        if (request.method === 'POST') {
          const payload = await readJsonBody(request);
          return json(await saveHandicapChallengePredictions(env.DB, groupCode, payload, { now: getNow(env) }));
        }
      }

      const groupChampionRoadMatch = url.pathname.match(/^\/api\/groups\/([^/]+)\/champion-road$/);
      if (groupChampionRoadMatch) {
        const groupCode = decodeURIComponent(groupChampionRoadMatch[1]);
        if (request.method === 'GET') {
          return json(await loadChampionRoad(env.DB, groupCode, { now: getNow(env) }));
        }
        if (request.method === 'POST') {
          const payload = await readJsonBody(request);
          return json(await saveChampionRoadPrediction(env.DB, groupCode, payload, { now: getNow(env) }));
        }
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

export async function loadAdvancementPredictions(db, groupCode, { now = new Date() } = {}) {
  const { group } = await getOrCreateGroup(db, groupCode);
  const [tiesResult, predictionsResult] = await Promise.all([
    loadQuarterfinalTies(db),
    db
      .prepare(`
        select player_id, match_id, winner_side, winner_name
        from advancement_predictions
        where group_id = ?
      `)
      .bind(group.id)
      .all(),
  ]);

  return {
    ties: (tiesResult.results || []).map((row) => toAdvancementTie(row, now)),
    predictions: (predictionsResult.results || []).map((row) => ({
      playerId: row.player_id,
      matchId: row.match_id,
      winnerSide: row.winner_side,
      winnerName: row.winner_name,
    })),
  };
}

export async function saveAdvancementPredictions(db, groupCode, payload, { now = new Date() } = {}) {
  const { group } = await getOrCreateGroup(db, groupCode);
  const playerId = String(payload?.playerId || '').trim();
  if (!playerId) throw httpError(400, 'invalid_player', 'Player is required');

  const player = await db
    .prepare('select id, name from players where id = ? and group_id = ? limit 1')
    .bind(playerId, group.id)
    .first();
  if (!player) throw httpError(404, 'player_not_found', 'Player not found');

  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const tiesResult = await loadQuarterfinalTies(db);
  const tiesByMatchId = new Map((tiesResult.results || []).map((tie) => [tie.match_code, tie]));
  const updatedAt = new Date().toISOString();
  let rowsWritten = 0;

  for (const entry of entries) {
    const matchId = String(entry?.matchId || '').trim();
    const winnerSide = String(entry?.winnerSide || '').trim();
    if (!matchId || !['home', 'away'].includes(winnerSide)) continue;
    const tie = tiesByMatchId.get(matchId);
    if (!tie) throw httpError(404, 'advancement_tie_not_found', 'Advancement tie not found');
    if (isAdvancementLocked(tie.kickoff_at_utc, now)) {
      throw httpError(409, 'advancement_locked', 'Advancement prediction is locked');
    }

    const winnerName = winnerSide === 'home' ? tie.home_cn : tie.away_cn;
    await db
      .prepare(`
        insert into advancement_predictions (id, group_id, player_id, match_id, winner_side, winner_name, updated_at)
        values (?, ?, ?, ?, ?, ?, ?)
        on conflict(group_id, player_id, match_id)
        do update set winner_side = excluded.winner_side,
          winner_name = excluded.winner_name,
          updated_at = excluded.updated_at
      `)
      .bind(randomId(), group.id, player.id, matchId, winnerSide, winnerName, updatedAt)
      .run();
    rowsWritten += 1;
  }

  return { ok: true, rowsWritten };
}

export async function loadHandicapChallenge(db, groupCode, { now = new Date() } = {}) {
  const { group } = await getOrCreateGroup(db, groupCode);
  const [matchesResult, predictionsResult] = await Promise.all([
    loadHandicapChallengeMatches(db),
    db
      .prepare(`
        select player_id, match_id, choice_key
        from handicap_challenge_predictions
        where group_id = ?
      `)
      .bind(group.id)
      .all(),
  ]);

  return {
    matches: (matchesResult.results || []).map((row) => toHandicapChallengeMatch(row, now)),
    predictions: (predictionsResult.results || []).map((row) => ({
      playerId: row.player_id,
      matchId: row.match_id,
      choiceKey: row.choice_key,
    })),
  };
}

export async function saveHandicapChallengePredictions(db, groupCode, payload, { now = new Date() } = {}) {
  const { group } = await getOrCreateGroup(db, groupCode);
  const playerId = String(payload?.playerId || '').trim();
  if (!playerId) throw httpError(400, 'invalid_player', 'Player is required');

  const player = await db
    .prepare('select id, name from players where id = ? and group_id = ? limit 1')
    .bind(playerId, group.id)
    .first();
  if (!player) throw httpError(404, 'player_not_found', 'Player not found');

  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const matchesResult = await loadHandicapChallengeMatches(db);
  const matchesById = new Map((matchesResult.results || []).map((match) => [match.match_id, match]));
  const updatedAt = new Date().toISOString();
  let rowsWritten = 0;

  for (const entry of entries) {
    const matchId = String(entry?.matchId || '').trim();
    const choiceKey = String(entry?.choiceKey || '').trim();
    if (!matchId || !isHandicapChoiceKey(choiceKey)) continue;
    const match = matchesById.get(matchId);
    if (!match) throw httpError(404, 'handicap_challenge_match_not_found', 'Handicap challenge match not found');
    if (isAdvancementLocked(match.kickoff_at_utc, now)) {
      throw httpError(409, 'handicap_challenge_locked', 'Handicap challenge is locked');
    }

    await db
      .prepare(`
        insert into handicap_challenge_predictions (id, group_id, player_id, match_id, choice_key, updated_at)
        values (?, ?, ?, ?, ?, ?)
        on conflict(group_id, player_id, match_id)
        do update set choice_key = excluded.choice_key,
          updated_at = excluded.updated_at
      `)
      .bind(randomId(), group.id, player.id, matchId, choiceKey, updatedAt)
      .run();
    rowsWritten += 1;
  }

  return { ok: true, rowsWritten };
}

export async function loadChampionRoad(db, groupCode, { now = new Date() } = {}) {
  const { group } = await getOrCreateGroup(db, groupCode);
  const [teams, predictionsResult] = await Promise.all([
    loadChampionRoadTeams(db),
    db
      .prepare(`
        select player_id, ranking
        from champion_road_predictions
        where group_id = ?
      `)
      .bind(group.id)
      .all(),
  ]);

  return {
    teams: teams.map((team) => ({ teamKey: team.teamKey, name: team.name })),
    locked: isChampionRoadLocked(teams, now),
    lockAtUtc: getChampionRoadLockAtUtc(teams),
    predictions: (predictionsResult.results || []).map((row) => ({
      playerId: row.player_id,
      ranking: parseTextList(row.ranking),
    })),
  };
}

export async function saveChampionRoadPrediction(db, groupCode, payload, { now = new Date() } = {}) {
  const { group } = await getOrCreateGroup(db, groupCode);
  const playerId = String(payload?.playerId || '').trim();
  if (!playerId) throw httpError(400, 'invalid_player', 'Player is required');

  const player = await db
    .prepare('select id, name from players where id = ? and group_id = ? limit 1')
    .bind(playerId, group.id)
    .first();
  if (!player) throw httpError(404, 'player_not_found', 'Player not found');

  const teams = await loadChampionRoadTeams(db);
  if (teams.length !== 4) throw httpError(409, 'champion_road_not_ready', 'Champion road teams are not ready');
  if (isChampionRoadLocked(teams, now)) {
    throw httpError(409, 'champion_road_locked', 'Champion road is locked');
  }

  const teamKeys = teams.map((team) => team.teamKey);
  const ranking = normalizeChampionRoadRanking(payload?.ranking, teamKeys);
  if (ranking.length !== teamKeys.length) {
    throw httpError(400, 'invalid_champion_ranking', 'Champion road ranking must include all teams once');
  }

  await db
    .prepare(`
      insert into champion_road_predictions (id, group_id, player_id, ranking, updated_at)
      values (?, ?, ?, ?, ?)
      on conflict(group_id, player_id)
      do update set ranking = excluded.ranking,
        updated_at = excluded.updated_at
    `)
    .bind(randomId(), group.id, player.id, JSON.stringify(ranking), new Date().toISOString())
    .run();

  return { ok: true, rowsWritten: 1 };
}

export async function loadLiveBoard(db, { from, to } = {}) {
  const window = normalizeLiveWindow({ from, to });
  const matchesResult = await db
    .prepare(`
      select match_code, match_date_cn, time_cn, home, away, home_cn, away_cn,
        home_score, away_score, settlement_home_score, settlement_away_score,
        settlement_score_source, status, status_detail, stage
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

function loadQuarterfinalTies(db) {
  return db
    .prepare(`
      select match_code, match_date_cn, time_cn, kickoff_at_utc, home_cn, away_cn,
        home_score, away_score, status
      from matches
      where active = 1 and stage in ('Quarterfinals', 'Quarterfinal')
      order by match_date_cn asc, time_cn asc
    `)
    .all();
}

function loadHandicapChallengeMatches(db) {
  return db
    .prepare(`
      select h.match_id, h.match_code, h.issue, h.date_cn, h.time_cn, h.kickoff_at_utc,
        h.home_cn, h.away_cn, h.handicap, h.odds_win, h.odds_draw, h.odds_loss,
        h.probability_win, h.probability_draw, h.probability_loss,
        m.home_score, m.away_score, m.settlement_home_score, m.settlement_away_score, m.status
      from handicap_challenge_matches h
      left join matches m on m.match_code = h.match_code
      where h.active = 1
      order by h.date_cn asc, h.time_cn asc
    `)
    .all();
}

async function loadChampionRoadTeams(db) {
  const result = await db
    .prepare(`
      select match_code, match_date_cn, time_cn, kickoff_at_utc, home_cn, away_cn
      from matches
      where active = 1 and stage in ('Semifinals', 'Semifinal')
      order by match_date_cn asc, time_cn asc
    `)
    .all();
  const teams = [];
  const seen = new Set();
  for (const row of result.results || []) {
    for (const name of [row.home_cn, row.away_cn]) {
      const teamName = String(name || '').trim();
      if (!teamName || seen.has(teamName)) continue;
      seen.add(teamName);
      teams.push({
        teamKey: teamName,
        name: teamName,
        kickoffAtUtc: row.kickoff_at_utc || '',
      });
    }
  }
  return teams.slice(0, 4);
}

function toAdvancementTie(row, now) {
  return {
    matchId: row.match_code,
    date: row.match_date_cn,
    time: row.time_cn,
    kickoffAtUtc: row.kickoff_at_utc || '',
    home: row.home_cn,
    away: row.away_cn,
    homeScore: normalizeNullableInteger(row.home_score),
    awayScore: normalizeNullableInteger(row.away_score),
    status: row.status || 'pre',
    locked: isAdvancementLocked(row.kickoff_at_utc, now),
  };
}

function toHandicapChallengeMatch(row, now) {
  return {
    matchId: row.match_id,
    matchCode: row.match_code || '',
    issue: row.issue || '',
    date: row.date_cn,
    time: row.time_cn,
    kickoffAtUtc: row.kickoff_at_utc || '',
    home: row.home_cn,
    away: row.away_cn,
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
    homeScore: normalizeNullableInteger(row.settlement_home_score ?? row.home_score),
    awayScore: normalizeNullableInteger(row.settlement_away_score ?? row.away_score),
    status: row.status || 'pre',
    locked: isAdvancementLocked(row.kickoff_at_utc, now),
  };
}

function isAdvancementLocked(kickoffAtUtc, now = new Date()) {
  const kickoffMs = Date.parse(kickoffAtUtc || '');
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now || ''));
  if (!Number.isFinite(kickoffMs) || !Number.isFinite(nowMs)) return false;
  return nowMs >= kickoffMs - 15 * 60 * 1000;
}

function isChampionRoadLocked(teams = [], now = new Date()) {
  const firstKickoffAtUtc = getFirstChampionRoadKickoffAtUtc(teams);
  return isAdvancementLocked(firstKickoffAtUtc, now);
}

function getChampionRoadLockAtUtc(teams = []) {
  const firstKickoffAtUtc = getFirstChampionRoadKickoffAtUtc(teams);
  const kickoffMs = Date.parse(firstKickoffAtUtc || '');
  if (!Number.isFinite(kickoffMs)) return '';
  return new Date(kickoffMs - 15 * 60 * 1000).toISOString();
}

function getFirstChampionRoadKickoffAtUtc(teams = []) {
  const times = teams
    .map((team) => team.kickoffAtUtc)
    .filter(Boolean)
    .sort();
  return times[0] || '';
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
    settlementHomeScore: Number.isInteger(row.settlement_home_score) ? row.settlement_home_score : normalizeNullableInteger(row.settlement_home_score),
    settlementAwayScore: Number.isInteger(row.settlement_away_score) ? row.settlement_away_score : normalizeNullableInteger(row.settlement_away_score),
    settlementScoreSource: row.settlement_score_source || '',
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
  return parseTextList(value);
}

function parseTextList(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
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

function isHandicapChoiceKey(value) {
  return ['win', 'draw', 'loss'].includes(value);
}

function normalizeChampionRoadRanking(ranking, teamKeys) {
  const allowed = new Set(teamKeys);
  const seen = new Set();
  return (Array.isArray(ranking) ? ranking : [])
    .map((teamKey) => String(teamKey || '').trim())
    .filter((teamKey) => {
      if (!allowed.has(teamKey) || seen.has(teamKey)) return false;
      seen.add(teamKey);
      return true;
    });
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

function getNow(env = {}) {
  const testNow = env.TEST_NOW ? new Date(env.TEST_NOW) : null;
  return testNow && !Number.isNaN(testNow.valueOf()) ? testNow : new Date();
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
