export function mergeLiveBoardSnapshot(currentSnapshot, liveSnapshot) {
  const current = currentSnapshot || {};
  const live = liveSnapshot || {};
  const liveMatches = Array.isArray(live.matches) ? live.matches : [];
  const liveMatchIds = new Set(liveMatches.map((match) => match.id || match.matchCode).filter(Boolean));

  const matches = [
    ...(Array.isArray(current.matches) ? current.matches : []).filter((match) => !liveMatchIds.has(match.id || match.matchCode)),
    ...liveMatches,
  ].sort((a, b) => `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`));

  return {
    ...current,
    generatedAt: live.generatedAt || current.generatedAt || '',
    liveWindow: live.window || current.liveWindow || null,
    matches,
    scoreOddsByMatch: {
      ...(current.scoreOddsByMatch || {}),
      ...(live.scoreOddsByMatch || {}),
    },
    aiRecommendationsByMatch: {
      ...(current.aiRecommendationsByMatch || {}),
      ...(live.aiRecommendationsByMatch || {}),
    },
    importReports: Array.isArray(live.importReports) && live.importReports.length
      ? live.importReports
      : (current.importReports || []),
  };
}
