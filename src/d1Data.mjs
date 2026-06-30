import { mapPredictionsByPlayer, mergePlayers } from './supabaseData.mjs';

export function createD1BrowserClient() {
  const baseUrl = import.meta.env.VITE_D1_API_URL;
  if (!baseUrl) return null;
  return createD1ApiClient({ baseUrl });
}

export function createD1ApiClient({ baseUrl, fetchImpl = fetch }) {
  const normalizedBaseUrl = String(baseUrl || '').replace(/\/+$/, '');
  if (!normalizedBaseUrl) return null;
  return {
    baseUrl: normalizedBaseUrl,
    fetchImpl,
  };
}

export async function loadD1GroupState({ client, groupCode }) {
  if (!client) throw new Error('D1 API 配置缺失');
  const response = await (0, client.fetchImpl)(`${client.baseUrl}/api/groups/${encodeURIComponent(groupCode)}/state`);
  if (!response.ok) {
    let errorText = response.statusText;
    try {
      const body = await response.json();
      errorText = body.error || body.message || errorText;
    } catch {
      // Keep status text when the Worker response is not JSON.
    }
    throw new Error(`D1 group state failed: ${response.status} ${errorText}`.trim());
  }

  return normalizeD1GroupState(await response.json(), { groupCode });
}

export async function loadD1LiveBoard({ client, from, to }) {
  if (!client) throw new Error('D1 API 配置缺失');
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const response = await (0, client.fetchImpl)(`${client.baseUrl}/api/live-board?${params.toString()}`);
  if (!response.ok) {
    let errorText = response.statusText;
    try {
      const body = await response.json();
      errorText = body.error || body.message || errorText;
    } catch {
      // Keep status text when the Worker response is not JSON.
    }
    throw new Error(`D1 live board failed: ${response.status} ${errorText}`.trim());
  }

  return normalizeD1LiveBoard(await response.json());
}

export async function createD1GroupPlayer({ client, groupCode, name }) {
  if (!client) throw new Error('D1 API 配置缺失');
  const trimmedName = String(name || '').trim();
  if (!trimmedName) return null;

  const body = await postD1Json({
    client,
    path: `/api/groups/${encodeURIComponent(groupCode)}/players`,
    payload: { name: trimmedName },
  });

  if (!body?.player?.id || !body?.player?.name) throw new Error('D1 player payload is invalid');
  return {
    id: body.player.id,
    name: body.player.name,
  };
}

export async function saveD1GroupPredictions({ client, groupCode, playerId, entries }) {
  if (!client) throw new Error('D1 API 配置缺失');
  const normalizedEntries = (entries || [])
    .map((entry) => ({
      matchId: entry.matchId,
      scores: normalizeScores(entry.scores),
    }))
    .filter((entry) => entry.matchId);

  if (!normalizedEntries.length) return { ok: true, rowsWritten: 0 };

  return postD1Json({
    client,
    path: `/api/groups/${encodeURIComponent(groupCode)}/predictions`,
    payload: { playerId, entries: normalizedEntries },
  });
}

async function postD1Json({ client, path, payload }) {
  const response = await (0, client.fetchImpl)(`${client.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorText = response.statusText;
    try {
      const body = await response.json();
      errorText = body.error || body.message || errorText;
    } catch {
      // Keep status text when the Worker response is not JSON.
    }
    throw new Error(`D1 request failed: ${response.status} ${errorText}`.trim());
  }

  return response.json();
}

export function normalizeD1GroupState(payload, { groupCode } = {}) {
  if (!payload || typeof payload !== 'object') throw new Error('D1 group state payload is invalid');
  const group = payload.group && typeof payload.group === 'object' ? payload.group : null;
  if (!group?.id || !group?.code) throw new Error('D1 group payload is invalid');
  if (groupCode && group.code !== groupCode) throw new Error('D1 group code mismatch');

  return {
    group: {
      id: group.id,
      code: group.code,
      name: group.name || group.code,
    },
    players: mergePlayers(Array.isArray(payload.players) ? payload.players : []),
    predictions: mapPredictionsByPlayer(Array.isArray(payload.predictions) ? payload.predictions : []),
  };
}

export function normalizeD1LiveBoard(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('D1 live board payload is invalid');
  return {
    generatedAt: payload.generatedAt || '',
    window: payload.window || null,
    matches: Array.isArray(payload.matches) ? payload.matches : [],
    scoreOddsByMatch: payload.scoreOddsByMatch && typeof payload.scoreOddsByMatch === 'object'
      ? payload.scoreOddsByMatch
      : {},
    aiRecommendationsByMatch: payload.aiRecommendationsByMatch && typeof payload.aiRecommendationsByMatch === 'object'
      ? payload.aiRecommendationsByMatch
      : {},
    aiStrategyStats: Array.isArray(payload.aiStrategyStats) ? payload.aiStrategyStats : [],
    importReports: Array.isArray(payload.importReports) ? payload.importReports : [],
  };
}

function normalizeScores(scores) {
  return Array.isArray(scores) ? scores.filter((score) => typeof score === 'string') : [];
}
