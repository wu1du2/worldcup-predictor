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

export function exportAdvancementPredictionsText({
  ties = [],
  players = [],
  predictionsByPlayer = {},
  currentGroupUrl = '',
} = {}) {
  const lines = ['16进8晋级预测'];
  const visiblePlayers = (players || []).filter((player) => player?.id && player?.name && player.name !== 'AI推荐');
  const validTies = (ties || []).filter((tie) => tie?.matchId && tie?.home && tie?.away);

  if (validTies.length) {
    lines.push(`顺序：${validTies.map((tie) => `${tie.home}vs${tie.away}`).join('、')}`);
  }

  const predictionLines = visiblePlayers
    .map((player) => {
      const picks = validTies.map((tie) => predictionsByPlayer?.[player.id]?.[tie.matchId]?.winnerName || '-');
      const hasAnyPick = picks.some((pick) => pick !== '-');
      return hasAnyPick ? `${player.name}：${picks.join('、')}` : '';
    })
    .filter(Boolean);
  lines.push(...(predictionLines.length ? predictionLines : ['暂无预测']));

  if (currentGroupUrl) lines.push(`[欢迎预测] ${currentGroupUrl}`);
  return lines.join('\n');
}
