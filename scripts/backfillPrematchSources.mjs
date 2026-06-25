import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildPrematchCollectedFiles,
  collectPrematchSourcesForMatch,
} from '../src/prematchContextCollector.mjs';
import { getHistoricalContextDirName } from '../src/historicalContextBuilder.mjs';
import { toAppMatch } from '../src/matchSchedule.mjs';
import { mapScoreOddsByMatch } from '../src/supabaseData.mjs';

await loadLocalEnv();

const args = parseArgs(process.argv.slice(2));
const dryRun = Boolean(args.dryRun);
const preserveTrusted = args.preserveTrusted !== 'false';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
}

const client = createClient(supabaseUrl, supabaseKey);
const [matchRows, oddsRows, trendRows] = await Promise.all([
  loadAllRows('matches', 'id,match_code,kickoff_at_utc,match_date_cn,time_cn,home,away,home_cn,away_cn,home_score,away_score,status,status_detail,venue,stage,home_team:teams!matches_home_team_id_fkey(name_en,name_cn),away_team:teams!matches_away_team_id_fkey(name_en,name_cn),active'),
  loadAllRows('score_odds', 'home,away,kickoff_label,score,odds'),
  loadAllRows('score_odds_trends', 'home,away,kickoff_label,score,first_odds,latest_odds,change_pct,snapshots_count'),
]);

const matches = matchRows
  .filter((row) => (
    row.active
    && row.match_code
    && row.match_date_cn
    && row.time_cn
    && row.home
    && row.away
    && row.status === 'post'
    && Number.isInteger(row.home_score)
    && Number.isInteger(row.away_score)
  ))
  .map((row) => ({ ...toAppMatch(row), kickoffAt: row.kickoff_at_utc, venue: row.venue || '' }))
  .filter((match) => !args.from || match.date >= args.from)
  .filter((match) => !args.to || match.date <= args.to)
  .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
const scoreOddsByMatch = mapScoreOddsByMatch(matches, oddsRows, trendRows);
const targetMatches = matches
  .filter((match) => (scoreOddsByMatch[match.id] || []).length > 0)
  .slice(0, args.limit ? Number(args.limit) : Number.POSITIVE_INFINITY);
const fetchCache = new Map();
const report = {
  runId,
  generatedAt: new Date().toISOString(),
  dryRun,
  preserveTrusted,
  targetMatches: targetMatches.length,
  writtenMatches: 0,
  skippedTrustedMatches: 0,
  matches: [],
};

for (let index = 0; index < targetMatches.length; index += 1) {
  const match = targetMatches[index];
  const dir = new URL(`../strategy_lab/match_info/${getHistoricalContextDirName(match)}/`, import.meta.url);
  const existingContext = await readExistingJson(new URL('context.json', dir));
  const existingAccepted = existingContext?.sourceGate?.accepted_source_ids || [];
  if (preserveTrusted && existingAccepted.length) {
    report.skippedTrustedMatches += 1;
    report.matches.push({
      matchId: match.id,
      match: `${match.date} ${match.time} ${match.home} vs ${match.away}`,
      contextQuality: existingContext.context_quality || 'external_prematch',
      acceptedSources: existingAccepted.length,
      excludedSources: existingContext?.sourceGate?.excluded_source_ids?.length || 0,
      skipped: 'existing trusted context preserved',
      moduleCoverage: {},
    });
    console.log(`${index + 1}/${targetMatches.length} ${match.date} ${match.time} ${match.home} vs ${match.away}: skipped existing trusted context (${existingAccepted.length})`);
    continue;
  }

  const collectedSources = await collectPrematchSourcesForMatch({
    match,
    cache: fetchCache,
    maxDiscoveredPerSource: Number(args.maxDiscoveredPerSource || 2),
  });
  const files = buildPrematchCollectedFiles({
    match,
    scoreOptions: scoreOddsByMatch[match.id],
    collectedSources,
    generatedAt: report.generatedAt,
  });
  const context = JSON.parse(files['context.json']);
  const moduleCoverage = summarizeModuleCoverage(files);
  const matchReport = {
    matchId: match.id,
    match: `${match.date} ${match.time} ${match.home} vs ${match.away}`,
    contextQuality: context.context_quality,
    acceptedSources: context.sourceGate.accepted_source_ids.length,
    weakSources: context.sourceGate.weak_source_ids?.length || 0,
    excludedSources: context.sourceGate.excluded_source_ids.length,
    moduleCoverage,
  };

  if (!dryRun) {
    for (const [relativePath, contents] of Object.entries(files)) {
      const file = new URL(relativePath, dir);
      const filePath = fileURLToPath(file);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(file, contents, 'utf8');
    }
    report.writtenMatches += 1;
  }

  report.matches.push(matchReport);
  console.log(`${index + 1}/${targetMatches.length} ${matchReport.match}: accepted ${matchReport.acceptedSources}, weak ${matchReport.weakSources}, excluded ${matchReport.excludedSources}`);
}

await writeReport(report);
console.log(`Prematch source backfill target matches: ${targetMatches.length}`);
console.log(`Written matches: ${report.writtenMatches}`);
console.log(`Skipped existing trusted contexts: ${report.skippedTrustedMatches}`);
console.log(`Report: docs/artifacts/strategy-lab/prematch-sources/${runId}.json`);

async function loadAllRows(table, select) {
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

async function readExistingJson(fileUrl) {
  try {
    return JSON.parse(await readFile(fileUrl, 'utf8'));
  } catch {
    return null;
  }
}

function summarizeModuleCoverage(files) {
  return Object.fromEntries([
    ['team_news', 'processed/team_news.json'],
    ['form_and_tactics', 'processed/form_and_tactics.json'],
    ['weather_and_venue', 'processed/weather_and_venue.json'],
    ['market', 'processed/market.json'],
  ].map(([key, file]) => {
    const parsed = JSON.parse(files[file]);
    return [key, {
      status: parsed.status || (parsed.external_market_context?.length ? 'collected' : 'market_only'),
      trustedSources: parsed.trusted_source_ids?.length || 0,
      weakSources: parsed.weak_source_ids?.length || 0,
      facts: parsed.facts?.length || parsed.external_market_context?.length || 0,
      weakFacts: parsed.weak_facts?.length || parsed.weak_market_context?.length || 0,
    }];
  }));
}

async function writeReport(report) {
  const artifactDir = new URL('../docs/artifacts/strategy-lab/prematch-sources/', import.meta.url);
  await mkdir(artifactDir, { recursive: true });
  await writeFile(new URL(`${runId}.json`, artifactDir), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(new URL(`${runId}.txt`, artifactDir), formatTextReport(report), 'utf8');
}

function formatTextReport(report) {
  const lines = [
    'Prematch source backfill',
    `Run: ${report.runId}`,
    `Dry run: ${report.dryRun}`,
    `Preserve trusted: ${report.preserveTrusted}`,
    `Target matches: ${report.targetMatches}`,
    `Written matches: ${report.writtenMatches}`,
    `Skipped existing trusted contexts: ${report.skippedTrustedMatches}`,
    '',
  ];
  for (const match of report.matches) {
    if (match.skipped) {
      lines.push(`${match.match}: skipped (${match.skipped}), accepted ${match.acceptedSources}`);
      continue;
    }
    lines.push(`${match.match}: accepted ${match.acceptedSources}, weak ${match.weakSources}, excluded ${match.excludedSources}, quality ${match.contextQuality}`);
    lines.push(`  team_news ${match.moduleCoverage.team_news.status}/${match.moduleCoverage.team_news.facts}+weak${match.moduleCoverage.team_news.weakFacts}`);
    lines.push(`  form_and_tactics ${match.moduleCoverage.form_and_tactics.status}/${match.moduleCoverage.form_and_tactics.facts}+weak${match.moduleCoverage.form_and_tactics.weakFacts}`);
    lines.push(`  market ${match.moduleCoverage.market.status}/${match.moduleCoverage.market.facts}+weak${match.moduleCoverage.market.weakFacts}`);
    lines.push(`  weather_and_venue ${match.moduleCoverage.weather_and_venue.status}/${match.moduleCoverage.weather_and_venue.facts}+weak${match.moduleCoverage.weather_and_venue.weakFacts}`);
  }
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    parsed[key] = value;
  }
  return parsed;
}

async function loadLocalEnv() {
  try {
    const envText = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of envText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      process.env[key] ||= valueParts.join('=');
    }
  } catch {
    // .env.local is optional; CI should use real environment variables.
  }
}
