import { buildHistoricalMarketOnlyFiles } from './historicalContextBuilder.mjs';

const requiredModules = ['team_news', 'form_and_tactics', 'market_context', 'weather_and_venue'];

const sourceTemplates = [
  {
    sourceId: 'rotowire_player_news',
    module: 'team_news',
    publisher: 'RotoWire',
    title: 'World Cup player news',
    url: () => 'https://www.rotowire.com/soccer/news.php?competition=1',
  },
  {
    sourceId: 'rotowire_lineups',
    module: 'team_news',
    publisher: 'RotoWire',
    title: 'World Cup predicted and confirmed lineups',
    url: () => 'https://www.rotowire.com/soccer/lineups.php?league=WOC',
  },
  {
    sourceId: 'rotowire_injuries',
    module: 'team_news',
    publisher: 'RotoWire',
    title: 'World Cup injury table',
    url: () => 'https://www.rotowire.com/soccer/injury-report.php?league=WOC',
  },
  {
    sourceId: 'sportsmole_preview_search',
    module: 'form_and_tactics',
    publisher: 'Sports Mole',
    title: 'Sports Mole match preview search',
    url: (match) => `https://www.sportsmole.co.uk/search/?s=${encodeURIComponent(`${queryTeam(match.home)} ${queryTeam(match.away)} World Cup prediction team news lineups`)}`,
    discovery: true,
    searchPage: true,
  },
  {
    sourceId: 'espn_search',
    module: 'form_and_tactics',
    publisher: 'ESPN',
    title: 'ESPN match analysis search',
    url: (match) => `https://www.espn.com/search/_/q/${encodeURIComponent(`${queryTeam(match.home)} ${queryTeam(match.away)} World Cup preview`)}`,
    discovery: true,
    searchPage: true,
  },
  {
    sourceId: 'fifa_news_search',
    module: 'form_and_tactics',
    publisher: 'FIFA',
    title: 'FIFA World Cup news',
    url: () => 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/news',
  },
  {
    sourceId: 'sporttery_correct_score',
    module: 'market_context',
    publisher: 'worldcup-predictor',
    title: 'Local Sporttery correct-score odds',
    url: () => null,
    internal: true,
  },
  {
    sourceId: 'oddschecker_search',
    module: 'market_context',
    publisher: 'OddsChecker',
    title: 'OddsChecker market context search',
    url: (match) => `https://www.oddschecker.com/search?q=${encodeURIComponent(`${queryTeam(match.home)} ${queryTeam(match.away)} World Cup odds`)}`,
    discovery: true,
    searchPage: true,
  },
  {
    sourceId: 'espn_betting_search',
    module: 'market_context',
    publisher: 'ESPN',
    title: 'ESPN betting search',
    url: (match) => `https://www.espn.com/search/_/q/${encodeURIComponent(`${queryTeam(match.home)} ${queryTeam(match.away)} odds World Cup`)}`,
    discovery: true,
    searchPage: true,
  },
  {
    sourceId: 'open_meteo_forecast',
    module: 'weather_and_venue',
    publisher: 'Open-Meteo',
    title: 'Open-Meteo forecast or historical weather endpoint',
    url: () => 'https://open-meteo.com/',
  },
  {
    sourceId: 'accuweather_search',
    module: 'weather_and_venue',
    publisher: 'AccuWeather',
    title: 'AccuWeather venue weather search',
    url: (match) => `https://www.accuweather.com/en/search-locations?query=${encodeURIComponent(match.venue || `${queryTeam(match.home)} ${queryTeam(match.away)}`)}`,
    discovery: true,
    searchPage: true,
  },
  {
    sourceId: 'weather_com_search',
    module: 'weather_and_venue',
    publisher: 'Weather.com',
    title: 'Weather.com venue search',
    url: (match) => `https://weather.com/search/enhancedlocalsearch?where=${encodeURIComponent(match.venue || `${queryTeam(match.home)} ${queryTeam(match.away)}`)}`,
    discovery: true,
    searchPage: true,
  },
];

export function buildPrematchSourceCandidates(match) {
  return sourceTemplates.map((template) => ({
    ...template,
    url: typeof template.url === 'function' ? template.url(match) : template.url,
  }));
}

export function gateSourceByKickoff({ source, kickoffUtc8 }) {
  const publishedAt = hasPreciseTime(source?.publishedAt) ? parseDate(source?.publishedAt) : null;
  const updatedAt = hasPreciseTime(source?.updatedAt) ? parseDate(source?.updatedAt) : null;
  const kickoff = parseDate(kickoffUtc8);

  if (!kickoff) {
    return { accepted: false, reason: 'invalid kickoff timestamp' };
  }

  if (!publishedAt && !updatedAt) {
    return { accepted: false, reason: 'missing timestamp' };
  }

  if (updatedAt && updatedAt >= kickoff) {
    return { accepted: false, reason: 'known updated after kickoff' };
  }

  const gateDate = publishedAt || updatedAt;
  if (!gateDate || gateDate >= kickoff) {
    return { accepted: false, reason: 'source timestamp is not before kickoff' };
  }

  return { accepted: true, reason: 'source timestamp is before kickoff' };
}

export function buildPrematchCollectedFiles({
  match,
  scoreOptions,
  collectedSources,
  generatedAt = new Date().toISOString(),
}) {
  const files = buildHistoricalMarketOnlyFiles({ match, scoreOptions, generatedAt });
  const context = JSON.parse(files['context.json']);
  const sources = JSON.parse(files['sources.json']);
  const raw = JSON.parse(files['raw/source_extracts.json']);
  const kickoffUtc8 = context.match.kickoff_utc8;

  const acceptedSources = [];
  const rejectedSources = [];
  for (const source of collectedSources || []) {
    const gate = gateSourceByKickoff({ source, kickoffUtc8 });
    const normalized = normalizeCollectedSource({ source, gate });
    if (gate.accepted) acceptedSources.push(normalized);
    else rejectedSources.push(normalized);
  }

  sources.trusted_sources = acceptedSources.map(toSourceRow);
  sources.audit_only_sources = [
    ...(sources.audit_only_sources || []),
    ...rejectedSources.map(toSourceRow),
  ];

  raw.extracts = [
    ...(raw.extracts || []),
    ...[...acceptedSources, ...rejectedSources].map(toRawExtract),
  ];

  context.context_quality = acceptedSources.length ? 'external_prematch' : 'market_only';
  context.sourceGate.accepted_source_ids = acceptedSources.map((source) => source.id);
  context.sourceGate.excluded_source_ids = [
    'local_supabase_market',
    ...rejectedSources.map((source) => source.id),
  ];

  const processedByFile = {
    'processed/team_news.json': buildProcessedModule({
      type: 'team_news',
      match,
      sources: acceptedSources.filter((source) => source.module === 'team_news'),
    }),
    'processed/form_and_tactics.json': buildProcessedModule({
      type: 'form_and_tactics',
      match,
      sources: acceptedSources.filter((source) => source.module === 'form_and_tactics'),
    }),
    'processed/weather_and_venue.json': buildProcessedModule({
      type: 'weather_and_venue',
      match,
      sources: acceptedSources.filter((source) => source.module === 'weather_and_venue'),
    }),
  };

  const market = JSON.parse(files['processed/market.json']);
  const marketSources = acceptedSources.filter((source) => source.module === 'market_context');
  market.trusted_source_ids = marketSources.map((source) => source.id);
  market.external_market_context = marketSources.flatMap((source) => source.facts.map((fact) => ({
    source_id: source.id,
    claim: fact,
    evidence_quality: source.evidenceQuality,
  })));
  market.prediction_signal = [
    ...(market.prediction_signal || []),
    ...market.external_market_context.map((fact) => fact.claim),
  ];

  context.publicContext.teamNews = processedByFile['processed/team_news.json'].prediction_signal;
  context.publicContext.formAndTactics = processedByFile['processed/form_and_tactics.json'].prediction_signal;
  context.publicContext.weatherAndVenue = processedByFile['processed/weather_and_venue.json'].prediction_signal;
  context.publicContext.marketRead = [
    ...(context.publicContext.marketRead || []),
    ...market.external_market_context.map((fact) => fact.claim),
  ];
  context.publicContext.media = acceptedSources.map((source) => ({
    source_id: source.id,
    title: source.title,
    publisher: source.publisher,
    url: source.url,
    published_at: source.publishedAt,
  }));

  return {
    ...files,
    'sources.json': stringifyJson(sources),
    'raw/source_extracts.json': stringifyJson(raw),
    'processed/market.json': stringifyJson(market),
    'processed/team_news.json': stringifyJson(processedByFile['processed/team_news.json']),
    'processed/form_and_tactics.json': stringifyJson(processedByFile['processed/form_and_tactics.json']),
    'processed/weather_and_venue.json': stringifyJson(processedByFile['processed/weather_and_venue.json']),
    'context.json': stringifyJson(context),
  };
}

export async function collectPrematchSourcesForMatch({
  match,
  fetcher = fetch,
  now = new Date().toISOString(),
  timeoutMs = 12000,
  maxDiscoveredPerSource = 2,
  cache = new Map(),
}) {
  const candidates = buildPrematchSourceCandidates(match);
  const collected = [];

  for (const candidate of candidates) {
    if (candidate.internal) {
      collected.push({
        ...candidate,
        publishedAt: match.kickoffAt || `${match.date}T${match.time}:00+08:00`,
        updatedAt: null,
        facts: ['Internal Sporttery correct-score odds are available from local Supabase tables.'],
        extractedText: '',
      });
      continue;
    }
    if (!candidate.url) continue;

    const fetched = await fetchTextWithCache({ url: candidate.url, fetcher, timeoutMs, cache });
    if (!fetched.ok) {
      collected.push({
        ...candidate,
        publishedAt: null,
        updatedAt: null,
        facts: [],
        extractedText: '',
        fetchStatus: 'failed',
        failure: fetched.error,
      });
      continue;
    }

    const primary = sourceFromHtml({ candidate, html: fetched.text, url: candidate.url, match, now });
    collected.push(primary);

    if (candidate.discovery) {
      const links = discoverLinks({ html: fetched.text, baseUrl: candidate.url, match }).slice(0, maxDiscoveredPerSource);
      for (let index = 0; index < links.length; index += 1) {
        const url = links[index];
        const linked = await fetchTextWithCache({ url, fetcher, timeoutMs, cache });
        collected.push(linked.ok
          ? sourceFromHtml({
            candidate: {
              ...candidate,
              sourceId: `${candidate.sourceId}_${index + 1}`,
              title: `${candidate.title} result ${index + 1}`,
              searchPage: false,
            },
            html: linked.text,
            url,
            match,
            now,
          })
          : {
            ...candidate,
            sourceId: `${candidate.sourceId}_${index + 1}`,
            url,
            publishedAt: null,
            updatedAt: null,
            facts: [],
            extractedText: '',
            fetchStatus: 'failed',
            failure: linked.error,
          });
      }
    }
  }

  return collected;
}

export function extractSourceMetadata({ html, url = '' }) {
  const text = String(html || '');
  const jsonLdDates = extractJsonLdDates(text);
  const publishedAt = firstDate([
    jsonLdDates.datePublished,
    extractMeta(text, ['article:published_time', 'datePublished', 'pubdate', 'publishdate']),
    extractTimeDatetime(text),
    extractLooseDate(text),
  ]);
  const updatedAt = firstDate([
    jsonLdDates.dateModified,
    extractMeta(text, ['article:modified_time', 'dateModified', 'lastmod']),
  ]);
  return {
    title: cleanText(extractMeta(text, ['og:title', 'twitter:title']) || extractTitle(text) || url),
    publishedAt,
    updatedAt,
  };
}

function sourceFromHtml({ candidate, html, url, match, now }) {
  const metadata = extractSourceMetadata({ html, url });
  const extractedText = candidate.searchPage ? '' : buildExtract(html, match);
  return {
    sourceId: candidate.sourceId,
    module: candidate.module,
    publisher: candidate.publisher,
    title: metadata.title || candidate.title,
    url,
    publishedAt: candidate.searchPage ? null : metadata.publishedAt,
    updatedAt: candidate.searchPage ? null : metadata.updatedAt,
    fetchedAt: now,
    facts: extractedText ? [extractedText] : [],
    extractedText,
    fetchStatus: 'ok',
  };
}

async function fetchTextWithCache({ url, fetcher, timeoutMs, cache }) {
  if (cache.has(url)) return cache.get(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 worldcup-predictor/1.0' },
    });
    const text = await response.text();
    const result = response.ok
      ? { ok: true, text }
      : { ok: false, error: `HTTP ${response.status}` };
    cache.set(url, result);
    return result;
  } catch (error) {
    const result = { ok: false, error: error.message || String(error) };
    cache.set(url, result);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeCollectedSource({ source, gate }) {
  return {
    id: source.sourceId,
    module: source.module,
    title: source.title || source.sourceId,
    publisher: source.publisher || '',
    url: source.url || null,
    publishedAt: source.publishedAt || null,
    updatedAt: source.updatedAt || null,
    fetchedAt: source.fetchedAt || null,
    facts: (source.facts || []).filter(Boolean).slice(0, 5),
    extractedText: source.extractedText || '',
    entersContext: gate.accepted,
    evidenceQuality: gate.accepted ? 'timestamped_pre_kickoff_extract' : 'audit_only',
    reason: gate.reason,
    fetchStatus: source.fetchStatus || 'ok',
    failure: source.failure || '',
  };
}

function toSourceRow(source) {
  return {
    id: source.id,
    title: source.title,
    publisher: source.publisher,
    url: source.url,
    published_at: source.publishedAt,
    updated_at: source.updatedAt,
    fetched_at: source.fetchedAt,
    enters_context: source.entersContext,
    evidence_quality: source.evidenceQuality,
    reason: source.reason,
    fetch_status: source.fetchStatus,
    failure: source.failure,
  };
}

function toRawExtract(source) {
  return {
    source_id: source.id,
    module: source.module,
    type: source.module,
    title: source.title,
    url: source.url,
    published_at: source.publishedAt,
    updated_at: source.updatedAt,
    enters_context: source.entersContext,
    facts: source.facts,
    extract: source.extractedText,
    reason: source.reason,
  };
}

function buildProcessedModule({ type, match, sources }) {
  const facts = sources.flatMap((source) => source.facts.map((fact) => ({
    source_id: source.id,
    claim: fact,
    evidence_quality: source.evidenceQuality,
  })));
  return {
    type,
    match: `${match.home} vs ${match.away}`,
    trusted_source_ids: sources.map((source) => source.id),
    status: facts.length ? 'collected' : 'not_collected',
    coverage: Math.min(1, sources.length / 3),
    facts,
    prediction_signal: facts.map((fact) => fact.claim),
  };
}

function discoverLinks({ html, baseUrl, match }) {
  const base = new URL(baseUrl);
  const anchors = [...String(html || '').matchAll(/href=["']([^"']+)["']/gi)]
    .map((matchResult) => {
      try {
        return new URL(matchResult[1], base).toString();
      } catch {
        return '';
      }
    })
    .filter(Boolean);
  const tokens = [match.home, match.away, romanizeTeam(match.home), romanizeTeam(match.away)]
    .map((value) => String(value || '').toLowerCase())
    .filter(Boolean);
  return [...new Set(anchors)].filter((url) => {
    const lower = decodeURIComponent(url).toLowerCase();
    return url !== base.toString()
      && !lower.includes('/search')
      && tokens.some((token) => lower.includes(token))
      && !lower.includes('/video/')
      && !lower.includes('/watch/');
  });
}

function buildExtract(html, match) {
  const plain = cleanText(stripHtml(html));
  const homeIndex = plain.toLowerCase().indexOf(String(match.home || '').toLowerCase());
  const awayIndex = plain.toLowerCase().indexOf(String(match.away || '').toLowerCase());
  const romanHome = romanizeTeam(match.home);
  const romanAway = romanizeTeam(match.away);
  const romanHomeIndex = plain.toLowerCase().indexOf(romanHome.toLowerCase());
  const romanAwayIndex = plain.toLowerCase().indexOf(romanAway.toLowerCase());
  const positions = [homeIndex, awayIndex, romanHomeIndex, romanAwayIndex].filter((index) => index >= 0);
  if (!positions.length) return '';
  const start = Math.max(0, Math.min(...positions) - 240);
  return plain.slice(start, start + 600);
}

function extractJsonLdDates(html) {
  for (const match of String(html || '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const objects = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] || [])];
      for (const item of objects.flat()) {
        if (item?.datePublished || item?.dateModified) {
          return {
            datePublished: item.datePublished,
            dateModified: item.dateModified,
          };
        }
      }
    } catch {
      // Ignore malformed metadata.
    }
  }
  return {};
}

function extractMeta(html, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
    const reversePattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i');
    const match = String(html || '').match(pattern) || String(html || '').match(reversePattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return '';
}

function extractTimeDatetime(html) {
  const match = String(html || '').match(/<time[^>]+datetime=["']([^"']+)["']/i);
  return match?.[1] || '';
}

function extractLooseDate(html) {
  const match = String(html || '').match(/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+2026)\b/i);
  return match?.[1] || '';
}

function extractTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] || '';
}

function firstDate(values) {
  for (const value of values) {
    if (!hasPreciseTime(value)) continue;
    const date = parseDate(value);
    if (date) return date.toISOString();
  }
  return null;
}

function parseDate(value) {
  if (!value) return null;
  const normalized = normalizeDateString(value);
  const date = new Date(normalized);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function normalizeDateString(value) {
  const raw = String(value).trim();
  if (/^\d{1,2}\s+[A-Za-z]+\s+2026$/.test(raw)) return `${raw} 00:00:00 GMT`;
  return raw;
}

function hasPreciseTime(value) {
  const raw = String(value || '').trim();
  return /T\d{2}:\d{2}/.test(raw)
    || /\b\d{1,2}:\d{2}\b/.test(raw)
    || /(?:GMT|UTC|[+-]\d{2}:?\d{2}|Z)$/i.test(raw);
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function cleanText(value) {
  return decodeHtml(value).replace(/\s+/g, ' ').trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function romanizeTeam(name) {
  const map = {
    阿根廷: 'argentina',
    澳大利亚: 'australia',
    波黑: 'bosnia',
    巴西: 'brazil',
    加拿大: 'canada',
    哥伦比亚: 'colombia',
    克罗地亚: 'croatia',
    捷克: 'czech',
    厄瓜多尔: 'ecuador',
    埃及: 'egypt',
    英格兰: 'england',
    法国: 'france',
    德国: 'germany',
    加纳: 'ghana',
    海地: 'haiti',
    伊朗: 'iran',
    伊拉克: 'iraq',
    日本: 'japan',
    墨西哥: 'mexico',
    摩洛哥: 'morocco',
    荷兰: 'netherlands',
    挪威: 'norway',
    巴拿马: 'panama',
    巴拉圭: 'paraguay',
    葡萄牙: 'portugal',
    卡塔尔: 'qatar',
    沙特阿拉伯: 'saudi',
    苏格兰: 'scotland',
    塞内加尔: 'senegal',
    南非: 'south africa',
    韩国: 'south korea',
    西班牙: 'spain',
    瑞典: 'sweden',
    瑞士: 'switzerland',
    突尼斯: 'tunisia',
    土耳其: 'turkey',
    乌拉圭: 'uruguay',
    美国: 'usa',
    乌兹别克斯坦: 'uzbekistan',
    佛得角: 'cape verde',
    科特迪瓦: 'ivory coast',
    库拉索: 'curacao',
    刚果民主共和国: 'congo',
    新西兰: 'new zealand',
    比利时: 'belgium',
    约旦: 'jordan',
    奥地利: 'austria',
    阿尔及利亚: 'algeria',
  };
  return map[name] || String(name || '');
}

function queryTeam(name) {
  return romanizeTeam(name) || String(name || '');
}

function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
