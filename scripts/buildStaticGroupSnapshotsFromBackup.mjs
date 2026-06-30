import fs from 'node:fs/promises';
import path from 'node:path';

import { buildStaticGroupSnapshotsFromBackupTables } from '../src/staticSnapshot.mjs';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const backupRoot = process.env.WORLDCUP_BACKUP_DIR
  || '/Users/bytedance/worldcup-predictor-backups/20260630T071921Z';
const tablesRoot = path.join(backupRoot, 'tables');
const outputRoot = path.join(repoRoot, 'public', 'group-snapshots');

const tableNames = ['groups', 'players', 'predictions'];
const tables = {};

for (const tableName of tableNames) {
  const filePath = path.join(tablesRoot, `${tableName}.json`);
  tables[tableName] = JSON.parse(await fs.readFile(filePath, 'utf8'));
}

const snapshots = buildStaticGroupSnapshotsFromBackupTables({ tables });
await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });

for (const [groupCode, snapshot] of Object.entries(snapshots)) {
  const fileName = `${encodeURIComponent(groupCode)}.json`;
  await fs.writeFile(
    path.join(outputRoot, fileName),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
}

console.log(`Wrote ${Object.keys(snapshots).length} static group snapshots to ${outputRoot}`);
