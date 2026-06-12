import { mkdir, writeFile } from 'node:fs/promises';

import {
  dedupeParsedMatches,
  filterMatchesByKickoffDates,
  parseSportteryScoreOddsHtml,
  toScoreOptionRows,
} from '../src/sportteryOdds.mjs';

const artifactDir = new URL('../docs/artifacts/odds-probe/', import.meta.url);
const baseUrl = 'https://trade.500.com/jczq/index.php?g=2&playid=271';
const days = getProbeDates();

await mkdir(artifactDir, { recursive: true });

const parsedMatches = [];

for (const date of days) {
  const url = `${baseUrl}&date=${date}`;
  const html = await fetchGb18030(url);
  await writeFile(new URL(`500-score-${date}.html`, artifactDir), html);
  const parsed = parseSportteryScoreOddsHtml(html);
  parsedMatches.push(...parsed);
  console.log(`${date}: parsed ${parsed.length} matches`);
}

const matches = filterMatchesByKickoffDates(dedupeParsedMatches(parsedMatches), days);
const rows = toScoreOptionRows(matches);
await writeFile(new URL('sporttery-score-odds.json', artifactDir), `${JSON.stringify({ dates: days, matches, rows }, null, 2)}\n`);

console.log(`Total parsed matches: ${parsedMatches.length}`);
console.log(`Unique matches: ${matches.length}`);
console.log(`Total score option rows: ${rows.length}`);
console.log(JSON.stringify(matches.slice(0, 8), null, 2));

async function fetchGb18030(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
    },
  });

  if (!response.ok) throw new Error(`500.com request failed: ${response.status}`);
  const buffer = await response.arrayBuffer();
  return new TextDecoder('gb18030').decode(buffer);
}

function getProbeDates(now = new Date('2026-06-12T12:00:00+08:00')) {
  const dates = [];
  for (let offset = 1; offset <= 3; offset += 1) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    dates.push(formatDate(date));
  }
  return dates;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
