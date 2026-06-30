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

      return json({ error: 'not_found' }, { status: 404 });
    } catch (error) {
      if (error?.code === 'group_not_found') {
        return json({ error: 'group_not_found' }, { status: 404 });
      }
      return json({ error: 'internal_error', message: error?.message || 'Worker error' }, { status: 500 });
    }
  },
};

export async function loadGroupState(db, groupCode) {
  const group = await db
    .prepare('select id, code, name from groups where code = ? limit 1')
    .bind(groupCode)
    .first();

  if (!group) {
    const error = new Error('Group not found');
    error.code = 'group_not_found';
    throw error;
  }

  const playersResult = await db
    .prepare('select id, name from players where group_id = ? order by created_at asc, name asc')
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

function parseScoreList(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((score) => typeof score === 'string') : [];
  } catch {
    return [];
  }
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
