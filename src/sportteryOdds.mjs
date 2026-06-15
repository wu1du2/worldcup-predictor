const sportteryScoreBaseUrl = 'https://trade.500.com/jczq/index.php?g=2&playid=271';

export function buildSportteryScoreUrl(date) {
  return `${sportteryScoreBaseUrl}&date=${date}`;
}

export function parseSportteryScoreOddsHtml(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const matchPattern = /(周[一二三四五六日][0-9]{3})\s+(世界杯)\s+([0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2})\s+([^<\s]+)\s+VS\s+([^<\s]+)\s+([\s\S]*?)(?=周[一二三四五六日][0-9]{3}\s+世界杯\s+[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2}|$)/g;
  const matches = [];
  let match;

  while ((match = matchPattern.exec(text))) {
    const [, issue, competition, kickoffLabel, home, away, oddsText] = match;
    const scores = extractScores(oddsText);
    if (!scores.length) continue;

    matches.push({
      issue,
      competition,
      kickoffLabel,
      home,
      away,
      scores,
    });
  }

  return matches;
}

export function toScoreOptionRows(matches, updatedAt = new Date().toISOString()) {
  return matches.flatMap((match) => match.scores.map((scoreOption) => ({
    source: '500',
    source_match_key: `${match.issue}|${match.home}|${match.away}|${match.kickoffLabel}`,
    home: match.home,
    away: match.away,
    kickoff_label: match.kickoffLabel,
    score: scoreOption.score,
    odds: scoreOption.odds,
    updated_at: updatedAt,
  })));
}

export function validateScoreOddsRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('No score odds rows to import.');
  }

  const keys = new Set();

  for (const [index, row] of rows.entries()) {
    for (const field of ['source', 'source_match_key', 'home', 'away', 'kickoff_label', 'score', 'updated_at']) {
      if (!row[field]) throw new Error(`Score odds row ${index} missing ${field}.`);
    }

    if (!isValidScoreLabel(row.score)) {
      throw new Error(`Score odds row ${index} has invalid score ${row.score}.`);
    }

    if (!Number.isFinite(row.odds) || row.odds <= 1) {
      throw new Error(`Score odds row ${index} has invalid odds ${row.odds}.`);
    }

    const key = `${row.source}|${row.source_match_key}|${row.score}`;
    if (keys.has(key)) throw new Error(`Found duplicate score odds row ${key}.`);
    keys.add(key);
  }

  return rows;
}

export function validateParsedOddsMatches(matches) {
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error('No score odds matches parsed.');
  }

  for (const [index, match] of matches.entries()) {
    for (const field of ['issue', 'competition', 'kickoffLabel', 'home', 'away']) {
      if (!match[field]) throw new Error(`Score odds match ${index} missing ${field}.`);
    }
    if (!Array.isArray(match.scores) || match.scores.length < 20) {
      throw new Error(`Score odds match ${match.issue || index} has too few score odds.`);
    }
  }

  return matches;
}

export function dedupeParsedMatches(matches) {
  const byKey = new Map();

  for (const match of matches) {
    const key = `${match.issue}|${match.home}|${match.away}|${match.kickoffLabel}`;
    if (!byKey.has(key)) byKey.set(key, match);
  }

  return [...byKey.values()];
}

export function filterMatchesByKickoffDates(matches, dates) {
  const allowedDates = new Set(dates);

  return matches.filter((match) => allowedDates.has(toFullKickoffDate(match.kickoffLabel)));
}

function extractScores(text) {
  const scores = [];
  const scorePattern = /(?:([0-9]):([0-9])|([胜平负])其[他它])\s+([0-9]+(?:\.[0-9]+)?)/g;
  let match;

  while ((match = scorePattern.exec(text))) {
    const score = match[3] ? `${match[3]}其他` : `${match[1]}-${match[2]}`;
    scores.push({
      score,
      odds: Number(match[4]),
    });
  }

  return scores;
}

function isValidScoreLabel(score) {
  return /^[0-9]+-[0-9]+$/.test(score) || /^[胜平负]其他$/.test(score);
}

function toFullKickoffDate(kickoffLabel) {
  return `2026-${kickoffLabel.slice(0, 5)}`;
}
