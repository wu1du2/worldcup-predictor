export const defaultAiPredictionScores = ['0-0', '0-1', '1-0', '1-1'];

export function buildDefaultAiPredictionEntries({ matches, scores = defaultAiPredictionScores }) {
  const uniqueScores = [...new Set(scores)].filter((score) => typeof score === 'string' && score.trim());
  if (!uniqueScores.length) throw new Error('AI prediction scores must not be empty.');

  return (matches || [])
    .filter((match) => match?.id)
    .map((match) => ({
      matchId: match.id,
      scores: uniqueScores,
    }));
}
