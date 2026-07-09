export const handicapChoiceKeys = ['win', 'draw', 'loss'];

const choiceLabels = {
  win: '让胜',
  draw: '让平',
  loss: '让负',
};

export function buildHandicapChallengeEntries(draft = {}) {
  return Object.entries(draft || {})
    .filter(([, choiceKey]) => handicapChoiceKeys.includes(choiceKey))
    .map(([matchId, choiceKey]) => ({ matchId, choiceKey }));
}

export function calculateAllHitProbability(draft = {}, matches = []) {
  const matchesById = new Map((matches || []).map((match) => [match?.matchId, match]));
  const probabilities = Object.entries(draft || {})
    .filter(([, choiceKey]) => handicapChoiceKeys.includes(choiceKey))
    .map(([matchId, choiceKey]) => Number(matchesById.get(matchId)?.probabilities?.[choiceKey]))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!probabilities.length) return 0;
  return probabilities.reduce((product, value) => product * value, 1);
}

export function formatHandicapChoiceLabel(_match, choiceKey) {
  return choiceLabels[choiceKey] || '';
}

export function formatHandicapMatchLabel(match) {
  const handicap = Number(match?.handicap);
  const sign = handicap > 0 ? '+' : '';
  return `${match?.home || ''}${sign}${Number.isFinite(handicap) ? handicap : ''} vs ${match?.away || ''}`;
}

export function getHandicapResultChoice(match) {
  if (match?.status !== 'post') return '';
  const homeScore = normalizeNullableInteger(match?.settlementHomeScore ?? match?.homeScore ?? match?.home_score);
  const awayScore = normalizeNullableInteger(match?.settlementAwayScore ?? match?.awayScore ?? match?.away_score);
  const handicap = Number(match?.handicap);
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || !Number.isFinite(handicap)) return '';

  const adjustedMargin = homeScore + handicap - awayScore;
  if (adjustedMargin > 0) return 'win';
  if (adjustedMargin === 0) return 'draw';
  return 'loss';
}

export function normalizeHandicapChallengePayload(payload = {}) {
  const matches = (Array.isArray(payload.matches) ? payload.matches : [])
    .filter((match) => match?.matchId && match?.home && match?.away)
    .map((match) => normalizeHandicapMatch(match));

  const predictionsByPlayer = {};
  for (const row of Array.isArray(payload.predictions) ? payload.predictions : []) {
    if (!row?.playerId || !row?.matchId || !handicapChoiceKeys.includes(row.choiceKey)) continue;
    predictionsByPlayer[row.playerId] ||= {};
    predictionsByPlayer[row.playerId][row.matchId] = {
      choiceKey: row.choiceKey,
    };
  }

  return { matches, predictionsByPlayer };
}

export function exportHandicapChallengeText({
  matches = [],
  players = [],
  predictionsByPlayer = {},
  currentGroupUrl = '',
} = {}) {
  const validMatches = (matches || []).filter((match) => match?.matchId && match?.home && match?.away);
  const lines = ['四强之路，舍你其谁'];

  for (const match of validMatches) {
    lines.push(`${formatHandicapMatchLabel(match)}：${handicapChoiceKeys.map((choiceKey) => {
      const odds = Number(match?.odds?.[choiceKey]);
      const probability = Number(match?.probabilities?.[choiceKey]);
      return `${formatHandicapChoiceLabel(match, choiceKey)} ${formatOdds(odds)}｜${formatProbability(probability)}`;
    }).join('，')}`);
  }

  const visiblePlayers = (players || []).filter((player) => player?.id && player?.name && player.name !== 'AI推荐');
  const playerLines = visiblePlayers
    .map((player) => {
      const draft = Object.fromEntries(validMatches.map((match) => [
        match.matchId,
        predictionsByPlayer?.[player.id]?.[match.matchId]?.choiceKey || '',
      ]));
      const hasAnyPick = Object.values(draft).some((choiceKey) => handicapChoiceKeys.includes(choiceKey));
      if (!hasAnyPick) return '';
      const picks = validMatches.map((match) => {
        const choiceKey = draft[match.matchId];
        const label = formatHandicapChoiceLabel(match, choiceKey);
        const resultChoice = getHandicapResultChoice(match);
        if (!label) return '-';
        if (!resultChoice) return label;
        return `${label}${choiceKey === resultChoice ? '✅' : '❌'}`;
      });
      return `${player.name}：${picks.join('、')}｜全中概率 ${formatProbability(calculateAllHitProbability(draft, validMatches))}`;
    })
    .filter(Boolean);

  lines.push('【预测】');
  lines.push(...(playerLines.length ? playerLines : ['暂无预测']));
  if (currentGroupUrl) lines.push(`[欢迎预测] ${currentGroupUrl}`);
  return lines.join('\n');
}

export function normalizeHandicapMatch(match = {}) {
  const odds = normalizeChoiceNumbers(match.odds);
  const providedProbabilities = normalizeChoiceNumbers(match.probabilities);
  return {
    matchId: match.matchId,
    matchCode: match.matchCode || '',
    issue: match.issue || '',
    date: match.date || '',
    time: match.time || '',
    kickoffAtUtc: match.kickoffAtUtc || '',
    home: match.home,
    away: match.away,
    handicap: Number(match.handicap),
    odds,
    probabilities: hasAllChoices(providedProbabilities) ? providedProbabilities : probabilitiesFromOdds(odds),
    homeScore: normalizeNullableInteger(match.homeScore),
    awayScore: normalizeNullableInteger(match.awayScore),
    settlementHomeScore: normalizeNullableInteger(match.settlementHomeScore),
    settlementAwayScore: normalizeNullableInteger(match.settlementAwayScore),
    status: match.status || 'pre',
    locked: Boolean(match.locked),
  };
}

export function probabilitiesFromOdds(odds = {}) {
  const inverse = {};
  let total = 0;
  for (const choiceKey of handicapChoiceKeys) {
    const odd = Number(odds?.[choiceKey]);
    inverse[choiceKey] = Number.isFinite(odd) && odd > 1 ? 1 / odd : 0;
    total += inverse[choiceKey];
  }
  if (!total) return { win: 0, draw: 0, loss: 0 };
  return Object.fromEntries(handicapChoiceKeys.map((choiceKey) => [choiceKey, inverse[choiceKey] / total]));
}

export function formatProbability(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '0.0%';
  return `${(number * 100).toFixed(1)}%`;
}

function normalizeChoiceNumbers(values = {}) {
  return Object.fromEntries(handicapChoiceKeys.map((choiceKey) => [choiceKey, Number(values?.[choiceKey])]));
}

function hasAllChoices(values = {}) {
  return handicapChoiceKeys.every((choiceKey) => Number.isFinite(values?.[choiceKey]) && values[choiceKey] > 0);
}

function formatOdds(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '-';
}

function normalizeNullableInteger(value) {
  if (Number.isInteger(value)) return value;
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}
