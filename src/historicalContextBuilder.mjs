const requiredStrategyScores = ['0-0', '0-1', '1-0', '1-1'];

export function getHistoricalContextDirName(match) {
  return `${match.date}_${sanitizePathPart(match.home)}_vs_${sanitizePathPart(match.away)}`;
}

export function buildHistoricalMarketOnlyFiles({ match, scoreOptions, generatedAt = new Date().toISOString() }) {
  const options = normalizeScoreOptions(scoreOptions);
  const baselineOptions = options.filter((option) => requiredStrategyScores.includes(option.score));

  const sources = {
    match: `${match.home} vs ${match.away}`,
    kickoff_utc8: toUtc8Kickoff(match),
    generated_at: generatedAt,
    trusted_sources: [],
    audit_only_sources: [
      {
        id: 'local_supabase_market',
        title: 'Local Supabase Sporttery correct-score odds',
        publisher: 'worldcup-predictor',
        url: null,
        published_at: null,
        enters_context: false,
        evidence_quality: 'internal_market_data',
        reason: 'Internal market data is used for odds context; it is not an external article source and carries no final-score text.',
      },
    ],
  };

  const raw = {
    match: `${match.home} vs ${match.away}`,
    kickoff_utc8: toUtc8Kickoff(match),
    generated_at: generatedAt,
    context_mode: 'historical_reconstruction',
    extracts: [
      {
        source_id: 'local_supabase_market',
        type: 'market',
        title: 'Local Supabase Sporttery correct-score odds',
        enters_context: true,
        facts: [
          `Loaded ${options.length} correct-score odds rows from local Supabase tables.`,
          `Main strategy required scores available: ${baselineOptions.map((option) => option.score).join(', ') || 'none'}.`,
        ],
      },
    ],
  };

  const processedMarket = {
    type: 'market',
    match: `${match.home} vs ${match.away}`,
    trusted_source_ids: [],
    internal_source_ids: ['local_supabase_market'],
    correct_score_inputs: {
      source: 'Local Supabase score_odds and score_odds_trends',
      baseline_scores: baselineOptions,
      all_scores: options,
    },
    prediction_signal: [
      'Market-only historical reconstruction. External pre-match sources have not been collected for this match yet.',
    ],
  };

  const context = {
    schemaVersion: 1,
    context_mode: 'historical_reconstruction',
    context_quality: 'market_only',
    generatedAt,
    match: {
      id: match.id,
      date: match.date,
      time: match.time,
      kickoffAt: match.kickoffAt || '',
      kickoff_utc8: toUtc8Kickoff(match),
      home: match.home,
      away: match.away,
      stage: match.stage || '',
    },
    sourceGate: {
      rule: 'published_at or updated_at must be earlier than kickoff_utc8 to enter this context',
      accepted_source_ids: [],
      excluded_source_ids: ['local_supabase_market'],
    },
    market: {
      scoreOptions: options,
    },
    publicContext: {
      processedFiles: [
        'processed/market.json',
        'processed/team_news.json',
        'processed/form_and_tactics.json',
        'processed/weather_and_venue.json',
      ],
      media: [],
      teamNews: [],
      formAndTactics: [],
      marketRead: [
        'Local Sporttery correct-score odds are available. No trusted external pre-match analysis has been collected for this match yet.',
      ],
      weatherAndVenue: [],
    },
  };

  return {
    'sources.json': stringifyJson(sources),
    'raw/source_extracts.json': stringifyJson(raw),
    'processed/market.json': stringifyJson(processedMarket),
    'processed/team_news.json': stringifyJson(emptyProcessed('team_news', match)),
    'processed/form_and_tactics.json': stringifyJson(emptyProcessed('form_and_tactics', match)),
    'processed/weather_and_venue.json': stringifyJson(emptyProcessed('weather_and_venue', match)),
    'odds_snapshot.json': stringifyJson({
      match: `${match.home} vs ${match.away}`,
      kickoff_utc8: toUtc8Kickoff(match),
      source: 'Supabase score_odds and score_odds_trends imported from Sporttery/500.com',
      score_options: options,
    }),
    'context.json': stringifyJson(context),
  };
}

function normalizeScoreOptions(scoreOptions) {
  return (scoreOptions || []).map((option) => {
    const normalized = {
      score: option.score,
      odds: Number(option.odds),
    };
    if (option.trend) {
      normalized.trend = option.trend;
    }
    return normalized;
  });
}

function emptyProcessed(type, match) {
  return {
    type,
    match: `${match.home} vs ${match.away}`,
    trusted_source_ids: [],
    status: 'not_collected',
    facts: [],
    prediction_signal: [],
  };
}

function toUtc8Kickoff(match) {
  if (!match.kickoffAt) return `${match.date}T${match.time}:00+08:00`;
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(match.kickoffAt)).replace(' ', 'T') + '+08:00';
}

function sanitizePathPart(value) {
  return String(value).replace(/[\\/:*?"<>|\\s]+/g, '_').replace(/^_+|_+$/g, '');
}

function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
