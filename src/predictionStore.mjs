export function createInitialState() {
  return {
    selectedPlayerId: '',
    customPlayers: [],
    draftPicks: {},
    predictions: {},
  };
}

export function addCustomPlayer(state, rawName) {
  const name = rawName.trim();
  if (!name) return state;

  const player = {
    id: `custom-${slugifyName(name)}`,
    name,
  };

  return {
    ...state,
    selectedPlayerId: player.id,
    customPlayers: [...(state.customPlayers || []), player],
    draftPicks: {},
  };
}

export function toggleScorePick(scores, score) {
  if (scores.includes(score)) {
    return scores.filter((item) => item !== score);
  }

  return [...scores, score];
}

export function submitPrediction(state, { playerId, matchId, scores }) {
  const nextPredictions = {
    ...state.predictions,
    [playerId]: {
      ...(state.predictions[playerId] || {}),
      [matchId]: [...scores],
    },
  };

  return {
    ...state,
    predictions: nextPredictions,
  };
}

export function exportPredictionsText({ dateLabel, matches, players, state }) {
  const lines = [`${dateLabel}波胆预测`];

  for (const match of matches) {
    lines.push('', `${match.time} ${match.home} vs ${match.away}`);

    for (const player of players) {
      const scores = state.predictions[player.id]?.[match.id] || [];
      if (scores.length > 0) {
        lines.push(`${player.name}：${scores.join(', ')}`);
      }
    }
  }

  return lines.join('\n').trimEnd();
}

function slugifyName(name) {
  const ascii = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');

  if (ascii) return ascii;

  return Array.from(name)
    .map((char) => char.charCodeAt(0).toString(16))
    .join('-');
}
