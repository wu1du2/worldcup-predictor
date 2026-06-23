const requiredFiles = [
  'sources.json',
  'raw/source_extracts.json',
  'processed/market.json',
  'processed/team_news.json',
  'processed/form_and_tactics.json',
  'processed/weather_and_venue.json',
  'odds_snapshot.json',
  'context.json',
];
const requiredMarketScores = ['0-0', '0-1', '1-0', '1-1'];
const forbiddenResultFields = ['homeScore', 'awayScore', 'home_score', 'away_score', 'actualScore', 'result'];
const effortSlots = [
  { key: 'media', path: ['publicContext', 'media'] },
  { key: 'team_news', path: ['publicContext', 'teamNews'] },
  { key: 'form_and_tactics', path: ['publicContext', 'formAndTactics'] },
  { key: 'external_market', path: ['publicContext', 'marketRead'] },
  { key: 'weather_and_venue', path: ['publicContext', 'weatherAndVenue'] },
  { key: 'official', path: ['publicContext', 'official'] },
];

export function verifyHistoricalMatchContext({ dirName, files, context, sources }) {
  const missing = requiredFiles.filter((file) => !files[file]);
  const marketScores = new Set((context?.market?.scoreOptions || []).map((option) => option.score));
  const missingMarketScores = requiredMarketScores.filter((score) => !marketScores.has(score));
  const effortDetails = effortSlots.map((slot) => ({
    key: slot.key,
    present: getByPath(context, slot.path)?.length > 0,
  }));
  const covered = effortDetails.filter((slot) => slot.present).length;
  const legality = verifyLegality({ context, sources });
  const requiredOk = missing.length === 0 && missingMarketScores.length === 0;
  const canBacktest = requiredOk && legality.ok;

  return {
    dirName,
    match: context?.match ? {
      id: context.match.id,
      date: context.match.date,
      time: context.match.time,
      home: context.match.home,
      away: context.match.away,
    } : null,
    required: {
      ok: requiredOk,
      missing,
      missingMarketScores,
      requiredMarketScoresOk: missingMarketScores.length === 0,
    },
    effort: {
      covered,
      total: effortSlots.length,
      percent: roundPercent((covered / effortSlots.length) * 100),
      details: effortDetails,
    },
    legality,
    contextQuality: classifyContextQuality({ requiredOk, covered }),
    canBacktest,
  };
}

export function buildHistoricalContextCompletionReport(results) {
  const requiredComplete = results.filter((result) => result.required.ok).length;
  const legalityPassed = results.filter((result) => result.legality.ok).length;
  const canBacktest = results.filter((result) => result.canBacktest).length;
  const coveredSlots = results.reduce((total, result) => total + result.effort.covered, 0);
  const totalSlots = results.reduce((total, result) => total + result.effort.total, 0);
  const missingEffortBySlot = {};

  for (const slot of effortSlots) {
    missingEffortBySlot[slot.key] = results.filter((result) => (
      !result.effort.details.find((detail) => detail.key === slot.key)?.present
    )).length;
  }

  return {
    generatedAt: new Date().toISOString(),
    targetMatches: results.length,
    required: {
      complete: requiredComplete,
      percent: results.length ? roundPercent((requiredComplete / results.length) * 100) : 0,
    },
    effort: {
      coveredSlots,
      totalSlots,
      percent: totalSlots ? roundPercent((coveredSlots / totalSlots) * 100) : 0,
      missingBySlot: missingEffortBySlot,
    },
    legality: {
      passed: legalityPassed,
      percent: results.length ? roundPercent((legalityPassed / results.length) * 100) : 0,
    },
    canBacktest,
    problemMatches: results.filter((result) => !result.canBacktest).map((result) => ({
      dirName: result.dirName,
      match: result.match,
      missing: result.required.missing,
      missingMarketScores: result.required.missingMarketScores,
      violations: result.legality.violations,
    })),
    results,
  };
}

export function formatHistoricalContextReport(report) {
  const lines = [
    '历史 context 批量验收',
    `目标比赛：${report.targetMatches}`,
    `必需信息完成：${report.required.complete}/${report.targetMatches} = ${report.required.percent}%`,
    `尽力信息覆盖：${report.effort.coveredSlots}/${report.effort.totalSlots} = ${report.effort.percent}%`,
    `合法性通过：${report.legality.passed}/${report.targetMatches} = ${report.legality.percent}%`,
    `可进入回测：${report.canBacktest}/${report.targetMatches}`,
    '',
    '尽力信息缺口：',
  ];

  for (const [slot, count] of Object.entries(report.effort.missingBySlot)) {
    lines.push(`- ${slot}: 缺 ${count} 场`);
  }

  if (report.problemMatches.length) {
    lines.push('', '问题场次：');
    for (const problem of report.problemMatches) {
      lines.push(`- ${problem.dirName}: missing=${problem.missing.join(',') || '无'} market=${problem.missingMarketScores.join(',') || '无'} violations=${problem.violations.join('; ') || '无'}`);
    }
  }

  return lines.join('\n');
}

function verifyLegality({ context, sources }) {
  const violations = [];
  const contextJson = JSON.stringify(context || {});
  for (const field of forbiddenResultFields) {
    if (contextJson.includes(`"${field}"`)) {
      violations.push(`context contains forbidden result field ${field}`);
    }
  }

  const acceptedIds = context?.sourceGate?.accepted_source_ids || [];
  const sourceById = new Map([
    ...(sources?.trusted_sources || []),
    ...(sources?.audit_only_sources || []),
  ].map((source) => [source.id, source]));
  const kickoff = new Date(context?.match?.kickoff_utc8 || context?.match?.kickoffAt || '');

  for (const id of acceptedIds) {
    const source = sourceById.get(id);
    if (!source) {
      violations.push(`accepted source ${id} is missing from sources.json`);
      continue;
    }
    if (source.enters_context !== true) {
      violations.push(`accepted source ${id} is not marked enters_context=true`);
    }
    const timestamp = source.updated_at || source.published_at;
    if (!timestamp) {
      violations.push(`accepted source ${id} has no timestamp`);
      continue;
    }
    const sourceTime = new Date(timestamp);
    if (!Number.isFinite(sourceTime.getTime()) || !Number.isFinite(kickoff.getTime())) {
      violations.push(`accepted source ${id} has invalid timestamp`);
      continue;
    }
    if (!(sourceTime < kickoff)) {
      violations.push(`accepted source ${id} is not before kickoff`);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

function classifyContextQuality({ requiredOk, covered }) {
  if (!requiredOk) return 'incomplete';
  if (covered >= 4) return 'enriched';
  if (covered >= 2) return 'partial';
  return 'market_only';
}

function getByPath(value, path) {
  return path.reduce((current, key) => current?.[key], value);
}

function roundPercent(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
