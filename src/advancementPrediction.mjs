const WINNER_SIDES = new Set(['home', 'away']);

export function buildAdvancementEntries(draft = {}) {
  return Object.entries(draft || {})
    .filter(([, winnerSide]) => WINNER_SIDES.has(winnerSide))
    .map(([matchId, winnerSide]) => ({ matchId, winnerSide }));
}

export function countAdvancementSelections(draft = {}, ties = []) {
  const tieIds = new Set((ties || []).map((tie) => tie?.matchId).filter(Boolean));
  return Object.entries(draft || {})
    .filter(([matchId, winnerSide]) => tieIds.has(matchId) && WINNER_SIDES.has(winnerSide))
    .length;
}

export function isAdvancementTieLocked(tie, now = new Date()) {
  const kickoffTime = Date.parse(tie?.kickoffAtUtc || '');
  if (!Number.isFinite(kickoffTime)) return false;
  return now.getTime() >= kickoffTime - 15 * 60 * 1000;
}

export function getAdvancementLockText(tie) {
  return tie?.locked ? '已锁定' : '可修改';
}

export function mergeAdvancementTiesWithMatches({ ties = [], matches = [] } = {}) {
  const matchesById = new Map((matches || []).map((match) => [match?.id || match?.matchId || match?.matchCode, match]));
  return (ties || []).map((tie) => {
    const match = matchesById.get(tie?.matchId);
    if (!match) return tie;
    return {
      ...tie,
      homeScore: normalizeNullableInteger(match.homeScore ?? match.home_score),
      awayScore: normalizeNullableInteger(match.awayScore ?? match.away_score),
      status: match.status || tie.status || 'pre',
    };
  });
}

export function exportAdvancementPredictionsText({
  ties = [],
  players = [],
  predictionsByPlayer = {},
  currentGroupUrl = '',
} = {}) {
  const visiblePlayers = (players || []).filter((player) => player?.id && player?.name && player.name !== 'AI推荐');
  const validTies = (ties || []).filter((tie) => tie?.matchId && tie?.home && tie?.away);
  const lines = [validTies.length === 8 ? '16进8晋级预测结果' : '8进4晋级预测结果'];
  const settledTies = validTies.filter((tie) => getAdvancementWinnerName(tie));
  const hasPendingTies = validTies.some((tie) => !getAdvancementWinnerName(tie));

  if (validTies.length) {
    lines.push(`正确答案：${validTies.map((tie) => getAdvancementWinnerName(tie) || '待定').join('、')}`);
  }

  const playerRows = visiblePlayers
    .map((player) => {
      const picks = validTies.map((tie) => {
        const pick = predictionsByPlayer?.[player.id]?.[tie.matchId]?.winnerName || '-';
        const winner = getAdvancementWinnerName(tie);
        if (pick === '-') return pick;
        if (!winner) return `${pick}？`;
        return `${pick}${pick === winner ? '✅' : '❌'}`;
      });
      const hasAnyPick = picks.some((pick) => pick !== '-');
      if (!hasAnyPick) return null;
      const hits = settledTies.filter((tie) => predictionsByPlayer?.[player.id]?.[tie.matchId]?.winnerName === getAdvancementWinnerName(tie)).length;
      return {
        name: player.name,
        hits,
        settledCount: settledTies.length,
        hasPendingTies,
        detail: `${player.name}：${picks.join('、')}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.hits - a.hits || a.name.localeCompare(b.name, 'zh-Hans-CN'));

  if (!playerRows.length) {
    lines.push('暂无预测');
  } else {
    lines.push('【排行榜】');
    lines.push(...playerRows.map((row) => `${row.name} ${row.hits}/${row.settledCount}${row.hasPendingTies ? '？' : ''}`));
    lines.push('【预测明细】');
    lines.push(...playerRows.map((row) => row.detail));
  }

  if (currentGroupUrl) lines.push(`[欢迎预测] ${currentGroupUrl}`);
  return lines.join('\n');
}

function getAdvancementWinnerName(tie) {
  if (tie?.status === 'post' && tie?.winnerName) return tie.winnerName;
  const homeScore = normalizeNullableInteger(tie?.homeScore ?? tie?.home_score);
  const awayScore = normalizeNullableInteger(tie?.awayScore ?? tie?.away_score);
  if (tie?.status !== 'post' || !Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore === awayScore) {
    return '';
  }
  return homeScore > awayScore ? tie.home : tie.away;
}

function normalizeNullableInteger(value) {
  if (Number.isInteger(value)) return value;
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}
