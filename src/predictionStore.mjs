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

export function formatScoreOptionLabel(option) {
  const displayScore = option.score.replace(/^(\d+)-(\d+)$/, '$1:$2');
  if (!option.odds) return displayScore;
  return `${displayScore}(${option.odds})`;
}

export function getCopyStatusText(status) {
  if (status === 'copied') return '已复制';
  if (status === 'failed') return '复制失败';
  return '一键复制';
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

export function buildPredictionResultRows({ matches, players, state, scoreOddsByMatch = {} }) {
  const completedMatches = (matches || []).filter(isCompletedMatch);
  const completedById = new Map(completedMatches.map((match) => [match.id, match]));
  const rows = [];

  for (const player of players || []) {
    const playerPredictions = state.predictions?.[player.id] || {};
    let cost = 0;
    let revenue = 0;
    let settledMatchCount = 0;
    const hits = [];

    for (const [matchId, scores] of Object.entries(playerPredictions)) {
      const match = completedById.get(matchId);
      if (!match || !Array.isArray(scores) || scores.length === 0) continue;

      settledMatchCount += 1;
      cost += scores.length;
      const actualScore = `${match.homeScore}-${match.awayScore}`;
      if (!scores.includes(actualScore)) continue;

      const odds = findScoreOdds(scoreOddsByMatch[matchId], actualScore);
      if (!Number.isFinite(odds)) continue;

      revenue += odds;
      hits.push({
        matchLabel: `${match.home} vs ${match.away}`,
        score: actualScore,
        odds,
      });
    }

    if (cost === 0) continue;

    rows.push({
      playerId: player.id,
      playerName: player.name,
      cost,
      revenue,
      netProfit: roundMetric(revenue - cost),
      settledMatchCount,
      roiPercent: Math.round(((revenue - cost) / cost) * 100),
      hits,
    });
  }

  return rows.sort((a, b) => (
    b.roiPercent - a.roiPercent
    || b.revenue - a.revenue
    || a.playerName.localeCompare(b.playerName, 'zh-Hans-CN')
  ));
}

export function exportPredictionsText({
  dateLabel,
  matches,
  players,
  state,
  scoreOddsByMatch = {},
  inviteDateLabel = '',
  inviteMatches = [],
  currentGroupUrl = '',
}) {
  const lines = [`${dateLabel}比分预测`];
  const completedMatches = (matches || []).filter(isCompletedMatch);
  const resultRows = buildPredictionResultRows({ matches, players, state, scoreOddsByMatch });

  lines.push('【今日战报】');

  if (!completedMatches.length) {
    lines.push('暂无完场比赛');
  } else if (!resultRows.length) {
    lines.push('暂无完场预测');
  } else {
    for (const row of resultRows) {
      lines.push(`${row.playerName} ROI ${row.roiPercent}%｜净收益 ${formatSignedAmount(row.netProfit)}｜命中 ${row.hits.length}/${row.settledMatchCount}｜成本 ${row.cost}`);
      for (const hit of row.hits) {
        lines.push(`${hit.matchLabel} ${hit.score}(${formatOdds(hit.odds)}) ✅`);
      }
    }
  }

  lines.push('【预测情况】');
  for (const [index, match] of matches.entries()) {
    lines.push(formatPredictionMatchHeader(match));

    for (const player of players) {
      const scores = state.predictions[player.id]?.[match.id] || [];
      if (scores.length > 0) {
        lines.push(`${player.name}：${scores.join(', ')}`);
      }
    }
  }

  if (currentGroupUrl) {
    lines.push(buildInviteLine({ inviteDateLabel, inviteMatches, currentGroupUrl }));
  }

  return lines.join('\n').trimEnd();
}

function isCompletedMatch(match) {
  return match.status === 'post'
    && Number.isInteger(match.homeScore)
    && Number.isInteger(match.awayScore);
}

function formatPredictionMatchHeader(match) {
  const baseLabel = `${match.time} ${match.home} vs ${match.away}`;
  if (!isCompletedMatch(match)) return baseLabel;
  return `${baseLabel}[${match.homeScore}-${match.awayScore}]`;
}

function findScoreOdds(scoreOptions = [], score) {
  const option = scoreOptions.find((item) => item.score === score);
  if (!option) return null;
  const odds = Number(option.odds);
  return Number.isFinite(odds) ? odds : null;
}

function formatOdds(odds) {
  return Number.isInteger(odds) ? String(odds) : String(odds);
}

function buildInviteLine({ inviteDateLabel, inviteMatches = [], currentGroupUrl }) {
  const matchList = inviteMatches
    .map((match) => `${match.home} vs ${match.away}`)
    .filter(Boolean)
    .join('、');

  if (!inviteDateLabel || !matchList) return `[欢迎预测] ${currentGroupUrl}`;
  return `[欢迎预测] ${inviteDateLabel}比赛 ${matchList} ${currentGroupUrl}`;
}

function formatSignedAmount(value) {
  const amount = formatMetric(value);
  return value > 0 ? `+${amount}` : amount;
}

function formatMetric(value) {
  const rounded = roundMetric(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}

function roundMetric(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
