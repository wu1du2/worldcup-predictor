import fs from 'node:fs/promises';
import path from 'node:path';

import { buildD1SeedSqlFromBackupTables } from '../src/d1BackupExport.mjs';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const backupRoot = process.env.WORLDCUP_BACKUP_DIR
  || '/Users/bytedance/worldcup-predictor-backups/20260630T071921Z';
const tablesRoot = path.join(backupRoot, 'tables');
const outputPath = process.env.D1_SEED_OUTPUT
  || path.join(repoRoot, 'output', 'd1-seed.sql');

const tableNames = [
  'groups',
  'players',
  'predictions',
  'matches',
  'score_odds',
  'score_odds_trends',
  'ai_recommendations',
  'ai_strategy_stats',
  'import_reports',
];
const tables = {};

for (const tableName of tableNames) {
  tables[tableName] = JSON.parse(await fs.readFile(path.join(tablesRoot, `${tableName}.json`), 'utf8'));
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, buildD1SeedSqlFromBackupTables({ tables }));
console.log(`Wrote D1 seed SQL to ${outputPath}`);
