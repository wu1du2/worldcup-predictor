import { normalizeSportteryTeamName } from './sportteryTeams.mjs';

const sportteryScoreBaseUrl = 'https://trade.500.com/jczq/index.php?g=2&playid=271';

export function buildSportteryScoreUrl(date) {
  return `${sportteryScoreBaseUrl}&date=${date}`;
}

export function parseSportteryScoreOddsHtml(html) {
  const structuredMatches = parseStructuredSportteryRows(html);
  if (structuredMatches.length) return structuredMatches;

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

function parseStructuredSportteryRows(html) {
  const segments = html.split(/<tr\b(?=[^>]*class="[^"]*\bbet-tb-tr\b[^"]*")/i).slice(1);
  const matches = [];

  for (const segment of segments) {
    const openingTag = segment.match(/^[^>]*>/)?.[0] || '';
    const attrs = parseAttributes(openingTag);
    if (attrs.datasimpleleague !== '世界杯') continue;

    const kickoffLabel = `${attrs.datamatchdate?.slice(5)} ${attrs.datamatchtime}`;
    const scores = extractScores(segment);
    if (!attrs.datamatchnum || !attrs.datahomesxname || !attrs.dataawaysxname || !kickoffLabel || !scores.length) continue;

    matches.push({
      issue: attrs.datamatchnum,
      competition: attrs.datasimpleleague,
      kickoffLabel,
      home: attrs.datahomesxname,
      away: attrs.dataawaysxname,
      scores,
    });
  }

  return matches;
}

function parseAttributes(tag) {
  const attrs = {};
  const attrPattern = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
  let match;

  while ((match = attrPattern.exec(tag))) {
    attrs[match[1].replace(/-/g, '').toLowerCase()] = decodeHtmlText(match[2]);
  }

  return attrs;
}

export function toScoreOptionRows(matches, updatedAt = new Date().toISOString()) {
  return matches.flatMap((match) => {
    const home = normalizeSportteryTeamName(match.home);
    const away = normalizeSportteryTeamName(match.away);

    return match.scores.map((scoreOption) => ({
      source: '500',
      source_match_key: `${match.issue}|${home}|${away}|${match.kickoffLabel}`,
      home,
      away,
      kickoff_label: match.kickoffLabel,
      kickoff_at_cn: toChinaKickoffIso(match.kickoffLabel, updatedAt),
      score: scoreOption.score,
      odds: scoreOption.odds,
      updated_at: updatedAt,
    }));
  });
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

export function dedupeScoreOptionRows(rows) {
  const byKey = new Map();

  for (const row of rows) {
    const key = `${row.source}|${row.source_match_key}|${row.score}`;
    byKey.set(key, row);
  }

  return [...byKey.values()];
}

export function toChinaKickoffIso(kickoffLabel, referenceIso = new Date().toISOString()) {
  const match = String(kickoffLabel || '').match(/^([0-9]{2})-([0-9]{2})\s+([0-9]{2}):([0-9]{2})$/);
  if (!match) return null;
  const year = String(referenceIso || '').match(/^([0-9]{4})/)?.[1] || String(new Date().getUTCFullYear());
  const [, month, day, hour, minute] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:00+08:00`;
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
    byKey.set(key, {
      ...match,
      scores: dedupeScores(match.scores),
    });
  }

  return [...byKey.values()];
}

export function filterMatchesByKickoffDates(matches, dates) {
  const allowedDates = new Set(dates);

  return matches.filter((match) => allowedDates.has(toFullKickoffDate(match.kickoffLabel)));
}

function extractScores(text) {
  const buttonScores = extractButtonScores(text);
  if (buttonScores.length) return buttonScores;

  const scores = [];
  const cleanText = htmlToText(text);
  const scorePattern = /(?:([0-9]):([0-9])|([胜平负])其[他它])\s+([0-9]+(?:\.[0-9]+)?)/g;
  let match;

  while ((match = scorePattern.exec(cleanText))) {
    const score = match[3] ? `${match[3]}其他` : `${match[1]}-${match[2]}`;
    scores.push({
      score,
      odds: Number(match[4]),
    });
  }

  return scores;
}

function extractButtonScores(html) {
  const scores = [];
  const buttonPattern = /<p\b(?=[^>]*\bdata-type="bf")(?=[^>]*\bdata-value="([^"]+)")(?=[^>]*\bdata-sp="([^"]+)")[^>]*>/g;
  let match;

  while ((match = buttonPattern.exec(html))) {
    const rawScore = decodeHtmlText(match[1]);
    const scoreMatch = rawScore.match(/^([0-9]):([0-9])$/);
    const otherMatch = rawScore.match(/^([胜平负])其[他它]$/);
    const score = otherMatch ? `${otherMatch[1]}其他` : `${scoreMatch?.[1]}-${scoreMatch?.[2]}`;
    if (!scoreMatch && !otherMatch) continue;
    scores.push({
      score,
      odds: Number(match[2]),
    });
  }

  return scores;
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlText(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function dedupeScores(scores) {
  const byScore = new Map();

  for (const score of scores) {
    byScore.set(score.score, score);
  }

  return [...byScore.values()];
}

function isValidScoreLabel(score) {
  return /^[0-9]+-[0-9]+$/.test(score) || /^[胜平负]其他$/.test(score);
}

function toFullKickoffDate(kickoffLabel) {
  return `2026-${kickoffLabel.slice(0, 5)}`;
}
