import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPrematchCollectedFiles,
  buildPrematchSourceCandidates,
  gateSourceByKickoff,
} from '../src/prematchContextCollector.mjs';

const match = {
  id: 'espn-1',
  date: '2026-06-25',
  time: '06:00',
  kickoffAt: '2026-06-24T22:00:00.000Z',
  home: '摩洛哥',
  away: '海地',
  stage: 'Group Stage',
};

test('buildPrematchSourceCandidates keeps at least three sources per external module', () => {
  const candidates = buildPrematchSourceCandidates(match);
  const externalModules = ['team_news', 'form_and_tactics', 'market_context', 'weather_and_venue'];

  for (const module of externalModules) {
    const moduleCandidates = candidates.filter((candidate) => candidate.module === module);
    assert.ok(moduleCandidates.length >= 3, `${module} has ${moduleCandidates.length} sources`);
    assert.equal(new Set(moduleCandidates.map((candidate) => candidate.sourceId)).size, moduleCandidates.length);
  }
});

test('gateSourceByKickoff accepts only sources known to be before kickoff in UTC+8', () => {
  const early = gateSourceByKickoff({
    source: { publishedAt: '2026-06-24T21:30:00+08:00' },
    kickoffUtc8: '2026-06-25T06:00:00+08:00',
  });
  const late = gateSourceByKickoff({
    source: { publishedAt: '2026-06-25T06:30:00+08:00' },
    kickoffUtc8: '2026-06-25T06:00:00+08:00',
  });
  const updatedAfterKickoff = gateSourceByKickoff({
    source: {
      publishedAt: '2026-06-24T21:30:00+08:00',
      updatedAt: '2026-06-25T07:00:00+08:00',
    },
    kickoffUtc8: '2026-06-25T06:00:00+08:00',
  });
  const missingTimestamp = gateSourceByKickoff({
    source: {},
    kickoffUtc8: '2026-06-25T06:00:00+08:00',
  });
  const dateOnly = gateSourceByKickoff({
    source: { publishedAt: '2026-06-24' },
    kickoffUtc8: '2026-06-25T06:00:00+08:00',
  });

  assert.equal(early.accepted, true);
  assert.equal(late.accepted, false);
  assert.match(late.reason, /not before kickoff/);
  assert.equal(updatedAfterKickoff.accepted, false);
  assert.match(updatedAfterKickoff.reason, /updated after kickoff/);
  assert.equal(missingTimestamp.accepted, false);
  assert.match(missingTimestamp.reason, /missing timestamp/);
  assert.equal(dateOnly.accepted, false);
  assert.match(dateOnly.reason, /missing timestamp/);
});

test('buildPrematchCollectedFiles writes trusted pre-kickoff facts and excludes late sources from context', () => {
  const files = buildPrematchCollectedFiles({
    match,
    scoreOptions: [
      { score: '1-1', odds: 8 },
      { score: '2-1', odds: 7 },
    ],
    generatedAt: '2026-06-25T12:00:00+08:00',
    collectedSources: [
      {
        sourceId: 'sportsmole_preview',
        module: 'form_and_tactics',
        title: 'Preview: Morocco vs Haiti',
        publisher: 'Sports Mole',
        url: 'https://example.com/preview',
        publishedAt: '2026-06-24T10:00:00+08:00',
        updatedAt: null,
        facts: ['Morocco are expected to press high and control territory.'],
        extractedText: 'short extract',
      },
      {
        sourceId: 'late_liveblog',
        module: 'team_news',
        title: 'Live updates',
        publisher: 'Example',
        url: 'https://example.com/live',
        publishedAt: '2026-06-25T07:00:00+08:00',
        updatedAt: null,
        facts: ['This should not enter context.'],
        extractedText: 'late extract',
      },
    ],
  });

  const context = JSON.parse(files['context.json']);
  const sources = JSON.parse(files['sources.json']);
  const tactics = JSON.parse(files['processed/form_and_tactics.json']);
  const teamNews = JSON.parse(files['processed/team_news.json']);

  assert.equal(context.context_quality, 'external_prematch');
  assert.deepEqual(context.sourceGate.accepted_source_ids, ['sportsmole_preview']);
  assert.deepEqual(context.sourceGate.excluded_source_ids.sort(), ['late_liveblog', 'local_supabase_market'].sort());
  assert.deepEqual(sources.trusted_sources.map((source) => source.id), ['sportsmole_preview']);
  assert.deepEqual(sources.audit_only_sources.map((source) => source.id).sort(), ['late_liveblog', 'local_supabase_market'].sort());
  assert.equal(tactics.facts[0].claim, 'Morocco are expected to press high and control territory.');
  assert.equal(teamNews.status, 'not_collected');
  assert.equal(JSON.stringify(context).includes('This should not enter context'), false);
});
