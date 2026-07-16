import { mapPredictionsByPlayer, mergePlayers } from './supabaseData.mjs';
import { normalizeChampionRoadPayload, normalizeRanking } from './championRoad.mjs';
import { handicapChoiceKeys, normalizeHandicapChallengePayload } from './handicapChallenge.mjs';

export function createD1BrowserClient() {
  return createD1BrowserClientFromEnv(import.meta.env);
}

export function createD1BrowserClientFromEnv(env = {}) {
  if (env.VITE_D1_ENABLED === 'false') return null;
  const baseUrl = env.VITE_D1_API_URL;
  if (!baseUrl) return null;
  return createD1ApiClient({ baseUrl });
}

export function createD1ApiClient({ baseUrl, fetchImpl = fetch }) {
  const normalizedBaseUrl = normalizeD1BaseUrl(baseUrl);
  if (normalizedBaseUrl === null) return null;
  return {
    baseUrl: normalizedBaseUrl,
    fetchImpl,
  };
}

function normalizeD1BaseUrl(baseUrl) {
  const trimmed = String(baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  if (trimmed === '/api') return '';
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed;
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

export async function loadD1AdvancementPredictions({ client, groupCode }) {
  if (!client) throw new Error('D1 API 配置缺失');
  const response = await (0, client.fetchImpl)(`${client.baseUrl}/api/groups/${encodeURIComponent(groupCode)}/advancement-predictions`);
  if (!response.ok) {
    let errorText = response.statusText;
    try {
      const body = await response.json();
      errorText = body.error || body.message || errorText;
    } catch {
      // Keep status text when the Worker response is not JSON.
    }
    throw new Error(`D1 advancement predictions failed: ${response.status} ${errorText}`.trim());
  }

  return normalizeD1AdvancementPredictions(await response.json());
}

export async function loadD1HandicapChallenge({ client, groupCode }) {
  if (!client) throw new Error('D1 API 配置缺失');
  const response = await (0, client.fetchImpl)(`${client.baseUrl}/api/groups/${encodeURIComponent(groupCode)}/handicap-challenge`);
  if (!response.ok) {
    let errorText = response.statusText;
    try {
      const body = await response.json();
      errorText = body.error || body.message || errorText;
    } catch {
      // Keep status text when the Worker response is not JSON.
    }
    throw new Error(`D1 handicap challenge failed: ${response.status} ${errorText}`.trim());
  }

  return normalizeHandicapChallengePayload(await response.json());
}

export async function loadD1ChampionRoad({ client, groupCode }) {
  if (!client) throw new Error('D1 API 配置缺失');
  const response = await (0, client.fetchImpl)(`${client.baseUrl}/api/groups/${encodeURIComponent(groupCode)}/champion-road`);
  if (!response.ok) {
    let errorText = response.statusText;
    try {
      const body = await response.json();
      errorText = body.error || body.message || errorText;
    } catch {
      // Keep status text when the Worker response is not JSON.
    }
    throw new Error(`D1 champion road failed: ${response.status} ${errorText}`.trim());
  }

  return normalizeChampionRoadPayload(await response.json());
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

export async function saveD1AdvancementPredictions({ client, groupCode, playerId, entries }) {
  if (!client) throw new Error('D1 API 配置缺失');
  const normalizedEntries = (entries || [])
    .map((entry) => ({
      matchId: entry.matchId,
      winnerSide: entry.winnerSide,
    }))
    .filter((entry) => entry.matchId && ['home', 'away'].includes(entry.winnerSide));

  if (!normalizedEntries.length) return { ok: true, rowsWritten: 0 };

  return postD1Json({
    client,
    path: `/api/groups/${encodeURIComponent(groupCode)}/advancement-predictions`,
    payload: { playerId, entries: normalizedEntries },
  });
}

export async function saveD1HandicapChallengePredictions({ client, groupCode, playerId, entries }) {
  if (!client) throw new Error('D1 API 配置缺失');
  const normalizedEntries = (entries || [])
    .map((entry) => ({
      matchId: entry.matchId,
      choiceKey: entry.choiceKey,
    }))
    .filter((entry) => entry.matchId && handicapChoiceKeys.includes(entry.choiceKey));

  if (!normalizedEntries.length) return { ok: true, rowsWritten: 0 };

  return postD1Json({
    client,
    path: `/api/groups/${encodeURIComponent(groupCode)}/handicap-challenge`,
    payload: { playerId, entries: normalizedEntries },
  });
}

export async function saveD1ChampionRoadPrediction({ client, groupCode, playerId, ranking }) {
  if (!client) throw new Error('D1 API 配置缺失');
  const normalizedRanking = normalizeRanking(ranking);
  if (!normalizedRanking.length) return { ok: true, rowsWritten: 0 };

  return postD1Json({
    client,
    path: `/api/groups/${encodeURIComponent(groupCode)}/champion-road`,
    payload: { playerId, ranking: normalizedRanking },
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

export function normalizeD1AdvancementPredictions(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('D1 advancement payload is invalid');
  const predictionsByPlayer = {};
  for (const row of Array.isArray(payload.predictions) ? payload.predictions : []) {
    if (!row?.playerId || !row?.matchId || !['home', 'away'].includes(row.winnerSide)) continue;
    predictionsByPlayer[row.playerId] ||= {};
    predictionsByPlayer[row.playerId][row.matchId] = {
      winnerSide: row.winnerSide,
      winnerName: row.winnerName || '',
    };
  }

  return {
    ties: (Array.isArray(payload.ties) ? payload.ties : [])
      .filter((tie) => tie?.matchId && tie?.home && tie?.away)
      .map((tie) => ({
        matchId: tie.matchId,
        date: tie.date || '',
        time: tie.time || '',
        kickoffAtUtc: tie.kickoffAtUtc || '',
        home: tie.home,
        away: tie.away,
        homeScore: normalizeNullableInteger(tie.homeScore),
        awayScore: normalizeNullableInteger(tie.awayScore),
        status: tie.status || 'pre',
        locked: Boolean(tie.locked),
      })),
    predictionsByPlayer,
  };
}

function normalizeScores(scores) {
  return Array.isArray(scores) ? scores.filter((score) => typeof score === 'string') : [];
}

function normalizeNullableInteger(value) {
  if (Number.isInteger(value)) return value;
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}
