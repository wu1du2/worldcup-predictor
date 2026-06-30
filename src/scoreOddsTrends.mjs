import { normalizeSportteryTeamName } from './sportteryTeams.mjs';
import { toChinaKickoffIso } from './sportteryOdds.mjs';

export function buildAllScoreOddsTrendRows({ snapshots }) {
  if (!Array.isArray(snapshots)) throw new Error('Trend snapshots must be an array.');

  const matchKeysById = new Map();

  for (const snapshot of snapshots) {
    for (const match of getSnapshotMatches(snapshot)) {
      if (!match.issue || !match.kickoffLabel || !match.home || !match.away) continue;
      const home = normalizeSportteryTeamName(match.home);
      const away = normalizeSportteryTeamName(match.away);
      const id = `${match.issue}|${home}|${away}|${match.kickoffLabel}`;
      matchKeysById.set(id, {
        source: match.source || '500',
        issue: match.issue,
        kickoffLabel: match.kickoffLabel,
        home,
        away,
      });
    }
  }

  return [...matchKeysById.values()]
    .flatMap((matchKey) => buildScoreOddsTrendRows({ snapshots, matchKey }))
    .sort((a, b) => (
      a.source_match_key.localeCompare(b.source_match_key)
      || a.score.localeCompare(b.score)
    ));
}

export function buildScoreOddsTrendRows({ snapshots, matchKey }) {
  if (!Array.isArray(snapshots)) throw new Error('Trend snapshots must be an array.');
  if (!matchKey?.issue || !matchKey?.kickoffLabel || !matchKey?.home || !matchKey?.away) {
    throw new Error('Trend matchKey requires issue, kickoffLabel, home, and away.');
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
    kickoff_at_cn: toChinaKickoffIso(matchKey.kickoffLabel, trend.latestSeenAt),
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
  return getSnapshotMatches(snapshot).find((match) => (
    match.issue === matchKey.issue
    && match.kickoffLabel === matchKey.kickoffLabel
    && normalizeSportteryTeamName(match.home) === matchKey.home
    && normalizeSportteryTeamName(match.away) === matchKey.away
  ));
}

function getSnapshotMatches(snapshot) {
  const matches = snapshot.parsed_json?.matches || snapshot.parsedJson?.matches || [];
  return Array.isArray(matches) ? matches : [];
}
