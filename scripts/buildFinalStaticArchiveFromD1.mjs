import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  buildStaticGroupSnapshotsFromBackupTables,
  buildStaticSnapshotFromBackupTables,
} from '../src/staticSnapshot.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archiveDate = getArg('archive-date') || new Date().toISOString().slice(0, 10);
const backupRoot = path.resolve(getArg('backup-dir') || `/Users/bytedance/worldcup-predictor-backups/${archiveDate}-final`);
const tableRoot = path.join(backupRoot, 'tables');
const groupSnapshotRoot = path.join(repoRoot, 'public', 'group-snapshots');
const tableNames = [
  'matches',
  'score_odds',
  'score_odds_trends',
  'ai_recommendations',
  'ai_strategy_stats',
  'import_reports',
  'groups',
  'players',
  'predictions',
  'advancement_predictions',
  'handicap_challenge_matches',
  'handicap_challenge_predictions',
  'champion_road_predictions',
];

await fs.mkdir(tableRoot, { recursive: true });
const tables = {};
for (const tableName of tableNames) {
  const rows = await d1Select(`select * from ${tableName}`);
  tables[tableName] = rows;
  await writeJson(path.join(tableRoot, `${tableName}.json`), rows);
  console.log(`${tableName}: ${rows.length}`);
}

const now = new Date();
const globalSnapshot = buildStaticSnapshotFromBackupTables({
  tables,
  now,
  importReportLimit: 20,
  archiveMode: true,
});
const groupSnapshots = buildStaticGroupSnapshotsFromBackupTables({ tables, now });

await fs.rm(groupSnapshotRoot, { recursive: true, force: true });
await fs.mkdir(groupSnapshotRoot, { recursive: true });
for (const [groupCode, snapshot] of Object.entries(groupSnapshots)) {
  await writeCompactJson(path.join(groupSnapshotRoot, `${encodeURIComponent(groupCode)}.json`), snapshot);
}

const finalMatch = globalSnapshot.matches.at(-1) || null;
const report = {
  generatedAt: now.toISOString(),
  archiveMode: true,
  sourceDatabase: 'worldcup-predictor',
  backupRoot,
  counts: Object.fromEntries(tableNames.map((name) => [name, tables[name].length])),
  static: {
    groups: Object.keys(groupSnapshots).length,
    matches: globalSnapshot.matches.length,
    oddsMatches: Object.keys(globalSnapshot.scoreOddsByMatch).length,
    aiRecommendationMatches: Object.keys(globalSnapshot.aiRecommendationsByMatch).length,
    aiStrategies: globalSnapshot.aiStrategyStats.length,
  },
  finalMatch: finalMatch ? {
    id: finalMatch.id,
    date: finalMatch.date,
    time: finalMatch.time,
    home: finalMatch.home,
    away: finalMatch.away,
    homeScore: finalMatch.homeScore,
    awayScore: finalMatch.awayScore,
    settlementHomeScore: finalMatch.settlementHomeScore,
    settlementAwayScore: finalMatch.settlementAwayScore,
    status: finalMatch.status,
    statusDetail: finalMatch.statusDetail,
  } : null,
};

validateArchive({ tables, globalSnapshot, groupSnapshots, report });
const publicReport = { ...report };
delete publicReport.backupRoot;
await writeCompactJson(path.join(repoRoot, 'public', 'data-snapshot.json'), globalSnapshot);
await writeJson(path.join(repoRoot, 'public', 'snapshot-manifest.json'), publicReport);
await writeJson(path.join(backupRoot, 'snapshot-report.json'), report);

console.log(`Wrote ${report.static.groups} group snapshots.`);
console.log(`Wrote global snapshot with ${report.static.matches} matches.`);
console.log(`Final match: ${report.finalMatch?.home} ${report.finalMatch?.homeScore}-${report.finalMatch?.awayScore} ${report.finalMatch?.away}; 90-minute settlement ${report.finalMatch?.settlementHomeScore}-${report.finalMatch?.settlementAwayScore}.`);
console.log(`Backup tables: ${tableRoot}`);

function validateArchive({ tables, globalSnapshot, groupSnapshots, report }) {
  const groupCodes = (tables.groups || []).map((row) => row.code).filter(Boolean);
  if (groupCodes.length !== Object.keys(groupSnapshots).length) {
    throw new Error(`Group snapshot count mismatch: ${groupCodes.length} D1 groups, ${Object.keys(groupSnapshots).length} files.`);
  }
  for (const groupCode of groupCodes) {
    if (!groupSnapshots[groupCode]) throw new Error(`Missing group snapshot: ${groupCode}`);
  }
  if (!globalSnapshot.archiveMode) throw new Error('Global snapshot is not marked as archive mode.');
  if (!globalSnapshot.matches.length) throw new Error('Global snapshot has no matches.');
  if (globalSnapshot.matches.some((match) => match.status !== 'post')) {
    throw new Error('At least one active match is not settled.');
  }
  if (report.finalMatch?.id !== 'espn-760517') throw new Error('World Cup final is not the last archived match.');
  if (report.finalMatch?.homeScore !== 1 || report.finalMatch?.awayScore !== 0) {
    throw new Error('World Cup final overall score is not Spain 1-0 Argentina.');
  }
  if (report.finalMatch?.settlementHomeScore !== 0 || report.finalMatch?.settlementAwayScore !== 0) {
    throw new Error('World Cup final 90-minute score is not 0-0.');
  }
}

async function d1Select(command) {
  const { stdout } = await execFileAsync('npx', [
    '--yes',
    'wrangler@4.106.0',
    'd1',
    'execute',
    'worldcup-predictor',
    '--remote',
    '--json',
    '--command',
    command,
  ], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 64,
  });
  const parsed = JSON.parse(stdout);
  if (!parsed?.[0]?.success) throw new Error(`D1 query failed: ${command}`);
  return parsed[0].results || [];
}

function getArg(name) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || '';
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeCompactJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}
