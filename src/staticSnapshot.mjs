import {
  loadAiRecommendations,
  loadMatches,
  loadScoreOdds,
} from './supabaseData.mjs';

export const staticSnapshotPath = '/data-snapshot.json';

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
  };
}

export async function buildStaticSnapshot({ client, now = new Date() }) {
  const matches = await loadMatches({ client });
  const [scoreOddsByMatch, aiRecommendationsByMatch] = await Promise.all([
    loadScoreOdds({ client, matches }),
    loadAiRecommendations({ client }),
  ]);
  return {
    generatedAt: now.toISOString(),
    oddsWindow: null,
    matches,
    scoreOddsByMatch,
    aiRecommendationsByMatch,
  };
}
