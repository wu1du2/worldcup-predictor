export function buildSourceConsensusSelection({
  odds,
  context = {},
  maxPicks = 3,
}) {
  const options = normalizeOdds(odds);
  const externalPredictions = normalizeExternalPredictions(context.externalPredictions);
  const explicitSourcesByScore = new Map();

  for (const prediction of externalPredictions) {
    if (!prediction.score) continue;
    explicitSourcesByScore.set(prediction.score, [
      ...(explicitSourcesByScore.get(prediction.score) || []),
      prediction.source,
    ]);
  }

  const scored = options.map((option) => {
    const sourceParts = [];
    let sourceScore = oddsConsensusScore(option, options);

    for (const prediction of externalPredictions) {
      if (prediction.score === option.score) {
        sourceScore += 6;
        sourceParts.push(`${prediction.source}明确${option.score}`);
      }

      if (prediction.outcome && prediction.outcome === getScoreOutcome(option.score)) {
        sourceScore += prediction.kind === 'score' ? 1.5 : 1.1;
      }

      if (prediction.bothTeamsScore === true && isBothTeamsScore(option.score)) {
        sourceScore += 0.85;
      }
      if (prediction.bothTeamsScore === false && isCleanSheetScore(option.score)) {
        sourceScore += 0.65;
      }

      if (prediction.totalLean === 'over' && getTotalGoals(option.score) >= 3) {
        sourceScore += 0.6;
      }
      if (prediction.totalLean === 'under' && getTotalGoals(option.score) <= 2) {
        sourceScore += 0.6;
      }
    }

    if (!sourceParts.length && externalPredictions.length) {
      const outcomeSources = externalPredictions
        .filter((prediction) => prediction.outcome === getScoreOutcome(option.score))
        .map((prediction) => prediction.source);
      if (outcomeSources.length) {
        sourceParts.push(`${uniqueValues(outcomeSources).join('/')}方向支持`);
      }
    }

    return {
      ...option,
      sourceScore: roundMetric(sourceScore),
      reason: sourceParts.length ? sourceParts.join('，') : '赔率共识靠前',
    };
  });

  const picks = scored
    .sort((a, b) => (
      b.sourceScore - a.sourceScore
      || a.odds - b.odds
      || a.score.localeCompare(b.score)
    ))
    .slice(0, maxPicks);

  return {
    picks,
    sourceCount: externalPredictions.length,
    explicitScoreCount: explicitSourcesByScore.size,
    summary: externalPredictions.length
      ? `机构明确比分 ${explicitSourcesByScore.size} 个，结合方向/进球倾向和赔率低位排序。`
      : '暂无外部来源，回退到赔率最低的市场共识比分。',
  };
}

export function getExternalPredictionStrength(context = {}) {
  return normalizeExternalPredictions(context.externalPredictions).length;
}

function normalizeOdds(odds) {
  return (odds || [])
    .filter((option) => option?.score && Number.isFinite(Number(option.odds)))
    .map((option) => ({
      score: option.score,
      odds: Number(option.odds),
      ...(Number.isFinite(Number(option.changePct)) ? { changePct: Number(option.changePct) } : {}),
    }));
}

function normalizeExternalPredictions(externalPredictions) {
  return (externalPredictions || [])
    .map((prediction) => ({
      source: String(prediction.source || '').trim(),
      kind: prediction.kind || (prediction.score ? 'score' : 'market'),
      score: normalizeScore(prediction.score),
      outcome: normalizeOutcome(prediction.outcome),
      bothTeamsScore: typeof prediction.bothTeamsScore === 'boolean' ? prediction.bothTeamsScore : null,
      totalLean: normalizeTotalLean(prediction.totalLean),
      note: String(prediction.note || '').trim(),
    }))
    .filter((prediction) => (
      prediction.source
      && (prediction.score || prediction.outcome || prediction.bothTeamsScore !== null || prediction.totalLean)
    ));
}

function oddsConsensusScore(option, options) {
  const sorted = [...options].sort((a, b) => a.odds - b.odds || a.score.localeCompare(b.score));
  const rank = sorted.findIndex((item) => item.score === option.score);
  return Math.max(0, 3 - rank * 0.35);
}

function normalizeScore(score) {
  if (typeof score !== 'string') return '';
  return /^\d+-\d+$/.test(score) || ['胜其他', '平其他', '负其他'].includes(score) ? score : '';
}

function normalizeOutcome(outcome) {
  if (['home', 'draw', 'away'].includes(outcome)) return outcome;
  return '';
}

function normalizeTotalLean(totalLean) {
  if (['over', 'under'].includes(totalLean)) return totalLean;
  return '';
}

function getScoreOutcome(score) {
  if (score === '胜其他') return 'home';
  if (score === '平其他') return 'draw';
  if (score === '负其他') return 'away';
  const match = String(score).match(/^(\d+)-(\d+)$/);
  if (!match) return 'unknown';
  const home = Number(match[1]);
  const away = Number(match[2]);
  if (home > away) return 'home';
  if (home === away) return 'draw';
  return 'away';
}

function isBothTeamsScore(score) {
  const match = String(score).match(/^(\d+)-(\d+)$/);
  return match ? Number(match[1]) > 0 && Number(match[2]) > 0 : false;
}

function isCleanSheetScore(score) {
  const match = String(score).match(/^(\d+)-(\d+)$/);
  return match ? Number(match[1]) === 0 || Number(match[2]) === 0 : false;
}

function getTotalGoals(score) {
  const match = String(score).match(/^(\d+)-(\d+)$/);
  return match ? Number(match[1]) + Number(match[2]) : 0;
}

function uniqueValues(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function roundMetric(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
