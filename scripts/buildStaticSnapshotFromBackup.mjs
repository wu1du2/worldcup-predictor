import { readFile, writeFile, mkdir } from 'node:fs/promises';

import { buildStaticSnapshotFromBackupTables } from '../src/staticSnapshot.mjs';

const backupDir = process.argv.find((arg) => arg.startsWith('--backup-dir='))
  ?.slice('--backup-dir='.length)
  || '/Users/bytedance/worldcup-predictor-backups/20260630T071921Z';

const tableNames = [
  'matches',
  'score_odds',
  'score_odds_trends',
  'ai_recommendations',
  'ai_strategy_stats',
  'import_reports',
];

const tables = {};
for (const tableName of tableNames) {
  tables[tableName] = await readJson(`${backupDir}/tables/${tableName}.json`);
}

const snapshot = buildStaticSnapshotFromBackupTables({ tables });
const outputUrl = new URL('../public/data-snapshot.json', import.meta.url);

await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(outputUrl, `${JSON.stringify(snapshot)}\n`);

console.log(`Wrote ${outputUrl.pathname}`);
console.log(`Snapshot: ${snapshot.matches.length} matches, ${Object.keys(snapshot.scoreOddsByMatch).length} odds matches, ${Object.keys(snapshot.aiRecommendationsByMatch).length} AI recommendation rows, ${snapshot.aiStrategyStats.length} AI strategy stats, ${snapshot.importReports.length} reports.`);

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
