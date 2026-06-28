import { createClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { getGithubRunUrl, writeImportReport } from '../src/importReports.mjs';
import {
  buildStrategyLoopReport,
  evaluateStrategyLoopProgress,
} from '../src/knockoutStrategyLoop.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await loadLocalEnv();

const options = parseArgs(process.argv.slice(2));
const reportClient = createReportClient();
const bestScores = [];
let finalProgress = null;

for (let round = 1; round <= options.maxRounds; round += 1) {
  const startedAt = new Date().toISOString();
  try {
    const run = await runBacktestRound();
    const topResult = run.results[0];
    bestScores.push(Number(topResult?.knockoutProxyScore) || 0);
    const progress = evaluateStrategyLoopProgress({
      bestScores,
      minImprovement: options.minImprovement,
      patience: options.patience,
      maxRounds: options.maxRounds,
    });
    finalProgress = progress;
    const loopReport = buildStrategyLoopReport({
      round,
      progress,
      topResult,
      artifactDir: run.artifactDir,
    });

    await reportLoop({
      client: reportClient,
      status: 'success',
      startedAt,
      finishedAt: new Date().toISOString(),
      rowsWritten: 1,
      itemsSeen: run.results.length,
      message: loopReport.message,
      errorDetail: loopReport.errorDetail,
    });

    console.log(loopReport.message);
    console.log(loopReport.errorDetail);
    if (progress.shouldStop) break;
  } catch (error) {
    await reportLoop({
      client: reportClient,
      status: 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      rowsWritten: 0,
      itemsSeen: bestScores.length,
      message: `策略迭代第${round}轮失败。`,
      errorDetail: error?.stack || error?.message || String(error),
    });
    throw error;
  }
}

if (finalProgress?.shouldStop) {
  console.log(`Strategy loop stopped: ${finalProgress.reason}. Best score ${finalProgress.bestScore} at round ${finalProgress.bestRound}.`);
}

async function runBacktestRound() {
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    path.join(repoRoot, 'scripts', 'backtestKnockoutProxyStrategies.mjs'),
  ], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 16,
  });
  if (stderr.trim()) console.warn(stderr.trim());

  const artifactMatch = stdout.match(/Wrote knockout proxy backtest artifacts to (.+)/);
  if (!artifactMatch) {
    throw new Error(`Cannot locate knockout loop artifact dir from output:\n${stdout}`);
  }
  const artifactDir = artifactMatch[1].trim();
  const results = JSON.parse(await readFile(path.join(artifactDir, 'results.json'), 'utf8'));
  return { artifactDir, results, stdout };
}

async function reportLoop({
  client,
  status,
  startedAt,
  finishedAt,
  rowsWritten,
  itemsSeen,
  message,
  errorDetail,
}) {
  if (!client) {
    console.warn(`Skipping strategy loop report: ${message}`);
    return false;
  }
  return writeImportReport({
    client,
    report: {
      jobName: 'strategy_loop',
      status,
      startedAt,
      finishedAt,
      rowsWritten,
      itemsSeen,
      message,
      errorDetail,
      runUrl: getGithubRunUrl(),
    },
  });
}

function createReportClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

function parseArgs(args) {
  const values = {
    maxRounds: 30,
    patience: 5,
    minImprovement: 0.5,
  };

  for (const arg of args) {
    const [key, rawValue] = arg.replace(/^--/, '').split('=');
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    if (key === 'max-rounds') values.maxRounds = Math.max(1, Math.floor(value));
    if (key === 'patience') values.patience = Math.max(1, Math.floor(value));
    if (key === 'min-improvement') values.minImprovement = Math.max(0, value);
  }

  return values;
}

async function loadLocalEnv() {
  try {
    const envText = await readFile(path.join(repoRoot, '.env.local'), 'utf8');
    for (const line of envText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      process.env[key] ||= valueParts.join('=');
    }
  } catch {
    // CI can provide real environment variables.
  }
}
