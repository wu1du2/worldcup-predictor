export function buildAiPredictionEntries({ predictionLog, contextsByFile }) {
  const items = Array.isArray(predictionLog.predictions)
    ? predictionLog.predictions
    : [predictionLog];

  return items.map((item) => {
    const context = contextsByFile[item.match_context_file];
    if (!context?.match?.id) {
      throw new Error(`Missing context match id for ${item.match_context_file}.`);
    }

    const scores = (item.prediction?.stakes || [])
      .filter((stake) => typeof stake.score === 'string' && Number(stake.stake) > 0)
      .map((stake) => stake.score);

    if (!scores.length) {
      throw new Error(`Prediction for ${item.match_context_file} has no valid scores.`);
    }

    return {
      matchId: context.match.id,
      scores,
    };
  });
}
