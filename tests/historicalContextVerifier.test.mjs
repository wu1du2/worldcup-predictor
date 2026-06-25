import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHistoricalContextCompletionReport,
  verifyHistoricalMatchContext,
} from '../src/historicalContextVerifier.mjs';

const completeFiles = {
  'sources.json': true,
  'raw/source_extracts.json': true,
  'processed/market.json': true,
  'processed/team_news.json': true,
  'processed/form_and_tactics.json': true,
  'processed/weather_and_venue.json': true,
  'odds_snapshot.json': true,
  'context.json': true,
};

const context = {
  schemaVersion: 1,
  match: {
    id: 'espn-1',
    home: '英格兰',
    away: '克罗地亚',
    kickoff_utc8: '2026-06-18T04:00:00+08:00',
  },
  sourceGate: {
    accepted_source_ids: ['trusted-preview'],
    excluded_source_ids: ['late-preview'],
  },
  market: {
    scoreOptions: [
      { score: '0-0', odds: 10 },
      { score: '0-1', odds: 13 },
      { score: '1-0', odds: 6.3 },
      { score: '1-1', odds: 5.8 },
    ],
  },
  publicContext: {
    media: [{ source_id: 'trusted-preview', summary: 'close match' }],
    teamNews: [{ source_id: 'trusted-preview', summary: 'lineups ready' }],
    formAndTactics: [{ source_id: 'trusted-preview', summary: 'England favourite' }],
    marketRead: ['Under 2.5 lean'],
    weatherAndVenue: [{ source_id: 'venue', summary: 'Arlington' }],
    official: [],
  },
};

const sources = {
  trusted_sources: [
    {
      id: 'trusted-preview',
      enters_context: true,
      published_at: '2026-06-17T12:30:00-04:00',
    },
  ],
  audit_only_sources: [
    {
      id: 'late-preview',
      enters_context: false,
      updated_at: '2026-06-18T10:55:00+01:00',
    },
  ],
};

test('verifyHistoricalMatchContext checks required files, effort coverage, and timestamp legality', () => {
  const result = verifyHistoricalMatchContext({
    dirName: '2026-06-18_英格兰_vs_克罗地亚',
    files: completeFiles,
    context,
    sources,
  });

  assert.equal(result.required.ok, true);
  assert.equal(result.required.missing.length, 0);
  assert.equal(result.required.requiredMarketScoresOk, true);
  assert.equal(result.effort.covered, 5);
  assert.equal(result.effort.total, 6);
  assert.equal(result.effort.percent, 83.33);
  assert.equal(result.legality.ok, true);
  assert.equal(result.canBacktest, true);
  assert.equal(result.contextQuality, 'enriched');
});

test('verifyHistoricalMatchContext fails legality when context leaks result fields or accepted source is late', () => {
  const result = verifyHistoricalMatchContext({
    dirName: 'bad-match',
    files: completeFiles,
    context: {
      ...context,
      actualScore: '4-2',
      sourceGate: { accepted_source_ids: ['late-preview'], excluded_source_ids: [] },
    },
    sources: {
      trusted_sources: [
        {
          id: 'late-preview',
          enters_context: true,
          updated_at: '2026-06-18T10:55:00+01:00',
        },
      ],
      audit_only_sources: [],
    },
  });

  assert.equal(result.legality.ok, false);
  assert.match(result.legality.violations.join('\n'), /forbidden result field/);
  assert.match(result.legality.violations.join('\n'), /not before kickoff/);
  assert.equal(result.canBacktest, false);
});

test('verifyHistoricalMatchContext counts and validates weak Beijing-day-before context', () => {
  const result = verifyHistoricalMatchContext({
    dirName: 'weak-match',
    files: completeFiles,
    context: {
      ...context,
      sourceGate: {
        accepted_source_ids: [],
        weak_source_ids: ['weak-tactics'],
        excluded_source_ids: [],
      },
      publicContext: {
        ...context.publicContext,
        formAndTactics: [],
      },
      weakContext: {
        formAndTactics: ['Date-only tactics preview from Beijing day before kickoff.'],
      },
    },
    sources: {
      trusted_sources: [],
      weak_sources: [
        {
          id: 'weak-tactics',
          enters_context: 'weak',
          published_date_only: '2026-06-17',
        },
      ],
      audit_only_sources: [],
    },
  });

  const tactics = result.effort.details.find((detail) => detail.key === 'form_and_tactics');
  assert.equal(tactics.present, true);
  assert.equal(tactics.trustedPresent, false);
  assert.equal(tactics.weakPresent, true);
  assert.equal(result.legality.ok, true);
});

test('verifyHistoricalMatchContext rejects weak context that is not Beijing day before kickoff', () => {
  const result = verifyHistoricalMatchContext({
    dirName: 'bad-weak-match',
    files: completeFiles,
    context: {
      ...context,
      sourceGate: {
        accepted_source_ids: [],
        weak_source_ids: ['weak-tactics'],
        excluded_source_ids: [],
      },
    },
    sources: {
      trusted_sources: [],
      weak_sources: [
        {
          id: 'weak-tactics',
          enters_context: 'weak',
          published_date_only: '2026-06-16',
        },
      ],
      audit_only_sources: [],
    },
  });

  assert.equal(result.legality.ok, false);
  assert.match(result.legality.violations.join('\n'), /not Beijing day before kickoff/);
});

test('buildHistoricalContextCompletionReport aggregates batch completion without blocking on bad matches', () => {
  const report = buildHistoricalContextCompletionReport([
    verifyHistoricalMatchContext({ dirName: 'ok', files: completeFiles, context, sources }),
    verifyHistoricalMatchContext({
      dirName: 'missing',
      files: { ...completeFiles, 'context.json': false },
      context: { ...context, market: { scoreOptions: [] } },
      sources,
    }),
  ]);

  assert.equal(report.targetMatches, 2);
  assert.equal(report.required.complete, 1);
  assert.equal(report.legality.passed, 2);
  assert.equal(report.canBacktest, 1);
  assert.equal(report.problemMatches.length, 1);
  assert.equal(report.effort.coveredSlots, 10);
});
