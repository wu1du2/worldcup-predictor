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

function parseScoreList(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((score) => typeof score === 'string') : [];
  } catch {
    return [];
  }
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
