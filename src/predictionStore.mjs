import { sportteryScoreTemplate } from './scoreTemplate.mjs';
import { formatSettlementScore, isSettledMatch, isWinningScoreLabel } from './settlementScore.mjs';

export function createInitialState() {
  return {
    selectedPlayerId: '',
    customPlayers: [],
    draftPicks: {},
    predictions: {},
  };
}

export function normalizePredictionState(rawState) {
  const state = {
    ...createInitialState(),
    ...(isPlainObject(rawState) ? rawState : {}),
  };

  return {
    ...state,
    selectedPlayerId: typeof state.selectedPlayerId === 'string' ? state.selectedPlayerId : '',
    customPlayers: Array.isArray(state.customPlayers) ? state.customPlayers : [],
    draftPicks: normalizeScoreMap(state.draftPicks),
    predictions: normalizePredictionsMap(state.predictions),
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
  const currentScores = Array.isArray(scores) ? scores : [];
  if (currentScores.includes(score)) {
    return currentScores.filter((item) => item !== score);
  }

  return [...currentScores, score];
}

export function formatScoreOptionLabel(option) {
  const displayScore = option.score.replace(/^(\d+)-(\d+)$/, '$1:$2');
  if (!option.odds) return displayScore;
  return `${displayScore}(${option.odds})`;
}

export function buildScoreOptionsForMatch(scoreOdds = []) {
  const oddsByScore = new Map(
    (scoreOdds || [])
      .filter((option) => sportteryScoreTemplate.includes(option?.score))
      .map((option) => [option.score, option]),
  );

  return sportteryScoreTemplate.map((score) => {
    const option = oddsByScore.get(score);
    return option ? { ...option, score } : { score };
  });
}

export function formatScoreTrendLabel(option) {
  const changePct = option.trend?.changePct;
  if (!Number.isFinite(changePct)) return '';
  const rounded = Math.round(changePct * 10) / 10;
  if (Object.is(rounded, -0) || rounded === 0) return '0%';
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

export function getScoreTrendDirection(option) {
  const changePct = option.trend?.changePct;
  if (!Number.isFinite(changePct) || Math.abs(changePct) < 0.05) return 'flat';
  return changePct > 0 ? 'up' : 'down';
}

export function isCorrectScoreOption(match, option) {
  return isWinningScoreLabel(match, option.score);
}

export function getCopyStatusText(status) {
  if (status === 'copied') return '已复制';
  if (status === 'failed') return '复制失败';
  return '一键复制';
}

export function getRoiTitle({ roiPercent, seed }) {
  const titles = getRoiTitleBand(roiPercent);
  return titles[stableHash(seed) % titles.length];
}

export function getRoiEmoji({ roiPercent, seed }) {
  const emojis = getRoiEmojiBand(roiPercent);
  return emojis[stableHash(seed) % emojis.length];
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
      const actualScore = formatSettlementScore(match);
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
      const title = getRoiTitle({
        roiPercent: row.roiPercent,
        seed: `${dateLabel}|${row.playerName}|${row.roiPercent}|title`,
      });
      const emoji = getRoiEmoji({
        roiPercent: row.roiPercent,
        seed: `${dateLabel}|${row.playerName}|${row.roiPercent}|emoji`,
      });
      lines.push(`${emoji}[${title}] ${row.playerName}｜${row.roiPercent}%`);
      lines.push(`净收益 ${formatSignedAmount(row.netProfit)}｜命中 ${row.hits.length}/${row.settledMatchCount}｜成本 ${row.cost}`);
      for (const hit of row.hits) {
        lines.push(`  ✅ ${hit.matchLabel} ${hit.score}(${formatOdds(hit.odds)})`);
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

export function exportAllTimeStatsText({
  matches,
  players,
  state,
  scoreOddsByMatch = {},
}) {
  const lines = ['【总榜统计】'];
  const completedMatches = (matches || []).filter(isCompletedMatch);
  const resultRows = buildPredictionResultRows({ matches, players, state, scoreOddsByMatch });

  if (!completedMatches.length) {
    lines.push('暂无完场比赛');
  } else if (!resultRows.length) {
    lines.push('暂无完场预测');
  } else {
    for (const row of resultRows) {
      lines.push(`${row.playerName} ROI ${row.roiPercent}%｜净收益 ${formatSignedAmount(row.netProfit)}｜命中 ${row.hits.length}/${row.settledMatchCount}｜成本 ${row.cost}`);
    }
  }

  return lines.join('\n');
}

function isCompletedMatch(match) {
  return isSettledMatch(match);
}

function formatPredictionMatchHeader(match) {
  const baseLabel = `${match.time} ${match.home} vs ${match.away}`;
  if (!isCompletedMatch(match)) return baseLabel;
  return `${baseLabel}[${formatSettlementScore(match)}]`;
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

function getRoiTitleBand(roiPercent) {
  if (roiPercent >= 200) return ['赔率刺客', '庄家噩梦', '剧本阅读者', '赛果穿越者', '大场面先生'];
  if (roiPercent >= 100) return ['懂球帝', '赛果预言家', '比分猎手', '神来一笔', '红单体质', '灵感在线'];
  if (roiPercent >= 30) return ['稳健大师', '小赚怡情', '准星在线', '有点东西'];
  if (roiPercent >= 0) return ['保本战士', '略懂皮毛', '谨慎派', '不亏就赢'];
  if (roiPercent >= -30) return ['手感微凉', '惜败选手', '差口气', '险些上岸', '差点回本', '今晚不服'];
  if (roiPercent >= -80) return ['快乐赞助商', '赛前很美', '玄学波动', '已经上头', '心态微崩'];
  return ['倒霉蛋', '天台观察员', '庄家好友', '玄学受害者'];
}

function getRoiEmojiBand(roiPercent) {
  if (roiPercent >= 200) return ['🚀', '🔥', '👑'];
  if (roiPercent >= 100) return ['🎯', '📈', '🏹'];
  if (roiPercent >= 30) return ['🟢', '✨', '💪'];
  if (roiPercent >= 0) return ['➕', '🟡', '🛟'];
  if (roiPercent >= -30) return ['😬', '🥲', '😮‍💨', '🛟', '🤏', '😤'];
  if (roiPercent >= -80) return ['💸', '🌧️', '🧨', '🤯', '📉', '😵‍💫'];
  return ['❌', '🧊', '🫠', '💀', '😵‍💫', '🧨'];
}

function stableHash(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) >>> 0;
  }
  return hash;
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

function normalizePredictionsMap(predictions) {
  if (!isPlainObject(predictions)) return {};

  const normalized = {};
  for (const [playerId, playerMatches] of Object.entries(predictions)) {
    const matches = normalizeScoreMap(playerMatches);
    if (Object.keys(matches).length > 0) {
      normalized[playerId] = matches;
    }
  }
  return normalized;
}

function normalizeScoreMap(scoreMap) {
  if (!isPlainObject(scoreMap)) return {};

  const normalized = {};
  for (const [matchId, scores] of Object.entries(scoreMap)) {
    normalized[matchId] = normalizeScores(scores);
  }
  return normalized;
}

function normalizeScores(scores) {
  return Array.isArray(scores) ? scores.filter((score) => typeof score === 'string') : [];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
