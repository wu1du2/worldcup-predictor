export function buildScoreOddsTrendRows({ snapshots, matchKey }) {
  if (!Array.isArray(snapshots)) throw new Error('Trend snapshots must be an array.');
  if (!matchKey?.kickoffLabel || !matchKey?.home || !matchKey?.away) {
    throw new Error('Trend matchKey requires kickoffLabel, home, and away.');
  }

  const byScore = new Map();

  for (const snapshot of snapshots) {
    const createdAt = snapshot.created_at || snapshot.createdAt;
    if (!createdAt) continue;

    const match = findSnapshotMatch(snapshot, matchKey);
    if (!match) continue;

    for (const option of match.scores || []) {
      if (!option.score || !Number.isFinite(Number(option.odds))) continue;
      const existing = byScore.get(option.score) || {
        score: option.score,
        firstOdds: Number(option.odds),
        latestOdds: Number(option.odds),
        firstSeenAt: createdAt,
        latestSeenAt: createdAt,
        snapshotsCount: 0,
      };

      existing.latestOdds = Number(option.odds);
      existing.latestSeenAt = createdAt;
      existing.snapshotsCount += 1;
      byScore.set(option.score, existing);
    }
  }

  return [...byScore.values()].map((trend) => ({
    source: matchKey.source || '500',
    source_match_key: `${matchKey.issue}|${matchKey.home}|${matchKey.away}|${matchKey.kickoffLabel}`,
    home: matchKey.home,
    away: matchKey.away,
    kickoff_label: matchKey.kickoffLabel,
    score: trend.score,
    first_odds: trend.firstOdds,
    latest_odds: trend.latestOdds,
    change_pct: ((trend.latestOdds / trend.firstOdds) - 1) * 100,
    first_seen_at: trend.firstSeenAt,
    latest_seen_at: trend.latestSeenAt,
    snapshots_count: trend.snapshotsCount,
    updated_at: trend.latestSeenAt,
  }));
}

function findSnapshotMatch(snapshot, matchKey) {
  const matches = snapshot.parsed_json?.matches || snapshot.parsedJson?.matches || [];
  return matches.find((match) => (
    match.kickoffLabel === matchKey.kickoffLabel
    && match.home === matchKey.home
    && match.away === matchKey.away
  ));
}
