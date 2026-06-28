export function evaluateStrategyLoopProgress({
  bestScores,
  minImprovement = 0.5,
  patience = 5,
  maxRounds = 30,
}) {
  const scores = (bestScores || []).map((score) => Number(score)).filter(Number.isFinite);
  const currentScore = scores.at(-1) || 0;
  const bestScore = scores.length ? Math.max(...scores) : 0;
  const bestRound = scores.findIndex((score) => score === bestScore) + 1;
  const previousBestScore = scores.length > 1 ? Math.max(...scores.slice(0, -1)) : 0;
  const currentImprovement = scores.length > 1 ? roundMetric(currentScore - previousBestScore) : roundMetric(currentScore);
  const plateauRounds = countPlateauRounds(scores, minImprovement);
  const reachedMaxRounds = scores.length >= maxRounds;
  const reachedPlateau = plateauRounds >= patience;

  return {
    shouldStop: reachedMaxRounds || reachedPlateau,
    reason: reachedMaxRounds ? 'max_rounds' : reachedPlateau ? 'plateau' : 'continue',
    bestScore: roundMetric(bestScore),
    bestRound,
    currentScore: roundMetric(currentScore),
    previousBestScore: roundMetric(previousBestScore),
    currentImprovement,
    plateauRounds,
    rounds: scores.length,
  };
}

export function buildStrategyLoopReport({
  round,
  progress,
  topResult,
  artifactDir,
}) {
  const stopText = progress.shouldStop
    ? progress.reason === 'max_rounds'
      ? '达到30轮上限'
      : '进入平台期'
    : '继续迭代';
  const strategyName = topResult?.strategyName || topResult?.strategyId || '未知策略';
  const score = roundMetric(topResult?.knockoutProxyScore ?? progress.currentScore);
  const roi = formatSigned(roundMetric(topResult?.roiPercent || 0));
  const hit = `${topResult?.hitMatches || 0}/${topResult?.settledMatches || 0}`;
  const averagePicks = roundMetric(topResult?.averagePicks || 0);

  return {
    message: `策略迭代第${round}轮：${stopText}。本轮最高分 ${score}，历史最高分 ${progress.bestScore}。`,
    errorDetail: [
      `最佳策略：${strategyName}`,
      `策略ID：${topResult?.strategyId || ''}`,
      `本轮分数：${score}`,
      `ROI：${roi}%`,
      `命中：${hit}`,
      `平均下注：${averagePicks}`,
      `本轮提升：${formatSigned(progress.currentImprovement)}`,
      `平台期计数：连续 ${progress.plateauRounds} 轮提升 < 0.5`,
      `停止原因：${formatStopReason(progress.reason)}`,
      `产物目录：${artifactDir || ''}`,
    ].join('\n'),
  };
}

function countPlateauRounds(scores, minImprovement) {
  if (scores.length <= 1) return 0;

  let bestBeforeRound = scores[0];
  let plateauRounds = 0;
  for (const score of scores.slice(1)) {
    const improvement = score - bestBeforeRound;
    if (improvement < minImprovement) {
      plateauRounds += 1;
    } else {
      plateauRounds = 0;
    }
    bestBeforeRound = Math.max(bestBeforeRound, score);
  }
  return plateauRounds;
}

function formatStopReason(reason) {
  if (reason === 'plateau') return '连续 5 轮最高分提升 < 0.5，报告平台期';
  if (reason === 'max_rounds') return '跑满 30 轮，报告平台期';
  return '未触发停止条件';
}

function formatSigned(value) {
  const number = roundMetric(value);
  return number > 0 ? `+${number}` : String(number);
}

function roundMetric(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
