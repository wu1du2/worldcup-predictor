export function normalizeChampionRoadPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') throw new Error('D1 champion road payload is invalid');
  const teams = normalizeChampionTeams(payload.teams);
  const teamKeys = new Set(teams.map((team) => team.teamKey));
  const predictionsByPlayer = {};

  for (const row of Array.isArray(payload.predictions) ? payload.predictions : []) {
    if (!row?.playerId) continue;
    const ranking = normalizeRanking(row.ranking, teamKeys);
    if (!ranking.length) continue;
    predictionsByPlayer[row.playerId] = {
      ranking,
      teamNames: ranking.map((teamKey) => teams.find((team) => team.teamKey === teamKey)?.name || teamKey),
    };
  }

  return {
    teams,
    locked: Boolean(payload.locked),
    lockAtUtc: payload.lockAtUtc || '',
    predictionsByPlayer,
  };
}

export function normalizeChampionTeams(teams = []) {
  const seen = new Set();
  return (Array.isArray(teams) ? teams : [])
    .map((team) => ({
      teamKey: String(team?.teamKey || team?.name || '').trim(),
      name: String(team?.name || team?.teamKey || '').trim(),
    }))
    .filter((team) => {
      if (!team.teamKey || !team.name || seen.has(team.teamKey)) return false;
      seen.add(team.teamKey);
      return true;
    });
}

export function buildDefaultChampionRanking(teams = []) {
  return normalizeChampionTeams(teams).map((team) => team.teamKey);
}

export function normalizeRanking(ranking = [], allowedTeamKeys = null) {
  const allowed = allowedTeamKeys instanceof Set ? allowedTeamKeys : null;
  const seen = new Set();
  return (Array.isArray(ranking) ? ranking : [])
    .map((teamKey) => String(teamKey || '').trim())
    .filter((teamKey) => {
      if (!teamKey || seen.has(teamKey)) return false;
      if (allowed && !allowed.has(teamKey)) return false;
      seen.add(teamKey);
      return true;
    });
}

export function isCompleteChampionRanking(ranking = [], teams = []) {
  const teamKeys = normalizeChampionTeams(teams).map((team) => team.teamKey);
  if (ranking.length !== teamKeys.length || teamKeys.length === 0) return false;
  const expected = new Set(teamKeys);
  return ranking.every((teamKey) => expected.has(teamKey)) && new Set(ranking).size === teamKeys.length;
}

export function moveChampionRankingItem(ranking = [], fromIndex, toIndex) {
  const next = [...ranking];
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return next;
  if (fromIndex < 0 || fromIndex >= next.length || toIndex < 0 || toIndex >= next.length || fromIndex === toIndex) return next;
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function getChampionRankingSummary(ranking = [], teams = []) {
  const namesByKey = new Map(normalizeChampionTeams(teams).map((team) => [team.teamKey, team.name]));
  return ranking
    .map((teamKey, index) => `${index + 1}.${namesByKey.get(teamKey) || teamKey}`)
    .join(' ');
}

export function exportChampionRoadText({
  teams = [],
  players = [],
  predictionsByPlayer = {},
  currentGroupUrl = '',
} = {}) {
  const normalizedTeams = normalizeChampionTeams(teams);
  const visiblePlayers = (players || []).filter((player) => player?.id && player?.name && player.name !== 'AI推荐');
  const lines = ['冠军之路'];

  if (normalizedTeams.length) {
    lines.push(`球队：${normalizedTeams.map((team) => team.name).join('、')}`);
  }

  lines.push('【预测】');
  const predictionLines = visiblePlayers
    .map((player) => {
      const ranking = normalizeRanking(predictionsByPlayer?.[player.id]?.ranking || [], new Set(normalizedTeams.map((team) => team.teamKey)));
      if (!ranking.length) return '';
      return `${player.name}：${getChampionRankingSummary(ranking, normalizedTeams)}`;
    })
    .filter(Boolean);

  lines.push(...(predictionLines.length ? predictionLines : ['暂无预测']));
  if (currentGroupUrl) lines.push(`[欢迎预测] ${currentGroupUrl}`);
  return lines.join('\n');
}
