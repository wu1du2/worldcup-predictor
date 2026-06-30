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
