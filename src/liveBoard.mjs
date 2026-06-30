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
    scoreOddsByMatch: mergeScoreOddsByMatch(current.scoreOddsByMatch, live.scoreOddsByMatch),
    aiRecommendationsByMatch: {
      ...(current.aiRecommendationsByMatch || {}),
      ...(live.aiRecommendationsByMatch || {}),
    },
    importReports: Array.isArray(live.importReports) && live.importReports.length
      ? live.importReports
      : (current.importReports || []),
  };
}

function mergeScoreOddsByMatch(currentOddsByMatch = {}, liveOddsByMatch = {}) {
  const merged = { ...currentOddsByMatch };
  for (const [matchId, liveOptions] of Object.entries(liveOddsByMatch || {})) {
    if (!Array.isArray(liveOptions) || liveOptions.length === 0) continue;
    const currentByScore = new Map(
      (Array.isArray(currentOddsByMatch?.[matchId]) ? currentOddsByMatch[matchId] : [])
        .map((option) => [option?.score, option])
        .filter(([score]) => score),
    );
    merged[matchId] = liveOptions.map((option) => {
      const currentOption = currentByScore.get(option?.score);
      if (option?.trend || !currentOption?.trend) return option;
      return { ...option, trend: currentOption.trend };
    });
  }
  return merged;
}
