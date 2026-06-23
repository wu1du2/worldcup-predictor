import { mkdir, readdir, readFile, writeFile, access } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildHistoricalContextCompletionReport,
  formatHistoricalContextReport,
  verifyHistoricalMatchContext,
} from '../src/historicalContextVerifier.mjs';

const matchInfoDir = new URL('../strategy_lab/match_info/', import.meta.url);
const matchInfoPath = fileURLToPath(matchInfoDir);
const artifactDir = new URL('../docs/artifacts/strategy-lab/historical-contexts/', import.meta.url);
const matchDirs = (await readdir(matchInfoPath, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(matchInfoPath, entry.name))
  .sort((a, b) => a.localeCompare(b));
const results = [];

for (const dir of matchDirs) {
  const files = await mapRequiredFiles(dir);
  const context = files['context.json'] ? await readJson(join(dir, 'context.json')) : null;
  const sources = files['sources.json'] ? await readJson(join(dir, 'sources.json')) : null;
  results.push(verifyHistoricalMatchContext({
    dirName: basename(dir),
    files,
    context,
    sources,
  }));
}

const report = buildHistoricalContextCompletionReport(results);
const reportText = formatHistoricalContextReport(report);
await mkdir(artifactDir, { recursive: true });
await writeFile(new URL('historical-context-verification.json', artifactDir), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(new URL('historical-context-verification.txt', artifactDir), `${reportText}\n`);

console.log(reportText);
console.log(`JSON report: ${new URL('historical-context-verification.json', artifactDir).pathname}`);
console.log(`Text report: ${new URL('historical-context-verification.txt', artifactDir).pathname}`);

async function mapRequiredFiles(dir) {
  const files = {};
  for (const file of [
    'sources.json',
    'raw/source_extracts.json',
    'processed/market.json',
    'processed/team_news.json',
    'processed/form_and_tactics.json',
    'processed/weather_and_venue.json',
    'odds_snapshot.json',
    'context.json',
  ]) {
    files[file] = await exists(join(dir, file));
  }
  return files;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    return {
      __invalidJson: true,
      file: filePath,
      error: error.message,
    };
  }
}
