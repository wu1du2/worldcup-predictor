export function parseTeamNameCsv(csvText) {
  const [header, ...lines] = csvText.trim().split(/\r?\n/);
  if (header !== 'name_en,name_cn') {
    throw new Error('Team mapping CSV must start with name_en,name_cn');
  }

  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name_en, name_cn] = line.split(',');
      return {
        name_en: name_en.trim(),
        name_cn: name_cn.trim(),
      };
    });
}

export function toTeamUpsertRows(teamNames) {
  return teamNames.map((team) => ({
    source: 'espn',
    name_en: team.name_en,
    name_cn: team.name_cn,
  }));
}

export function attachTeamsToMatches(matches, teams) {
  const teamsByName = new Map(teams.map((team) => [team.name_en, team]));

  return matches.map((match) => {
    const homeTeam = teamsByName.get(match.home);
    const awayTeam = teamsByName.get(match.away);

    return {
      ...match,
      home_team_id: homeTeam?.id || null,
      away_team_id: awayTeam?.id || null,
      home_cn: homeTeam?.name_cn || match.home_cn || match.home,
      away_cn: awayTeam?.name_cn || match.away_cn || match.away,
    };
  });
}
