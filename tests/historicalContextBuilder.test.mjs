import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHistoricalMarketOnlyFiles,
  getHistoricalContextDirName,
} from '../src/historicalContextBuilder.mjs';

test('getHistoricalContextDirName creates stable readable match directory names', () => {
  assert.equal(
    getHistoricalContextDirName({
      date: '2026-06-18',
      home: '英格兰',
      away: '克罗地亚',
    }),
    '2026-06-18_英格兰_vs_克罗地亚',
  );
});

test('buildHistoricalMarketOnlyFiles creates required files without leaking result fields', () => {
  const files = buildHistoricalMarketOnlyFiles({
    match: {
      id: 'espn-1',
      date: '2026-06-18',
      time: '04:00',
      kickoffAt: '2026-06-17T20:00:00+00:00',
      home: '英格兰',
      away: '克罗地亚',
      stage: 'Group Stage',
      homeScore: 4,
      awayScore: 2,
    },
    scoreOptions: [
      { score: '0-0', odds: 10 },
      { score: '0-1', odds: 13 },
      { score: '1-0', odds: 6.3 },
      { score: '1-1', odds: 5.8 },
    ],
    generatedAt: '2026-06-23T22:00:00+08:00',
  });

  assert.deepEqual(Object.keys(files).sort(), [
    'context.json',
    'odds_snapshot.json',
    'processed/form_and_tactics.json',
    'processed/market.json',
    'processed/team_news.json',
    'processed/weather_and_venue.json',
    'raw/source_extracts.json',
    'sources.json',
  ]);
  const context = JSON.parse(files['context.json']);
  assert.equal(JSON.stringify(context).includes('homeScore'), false);
  assert.equal(JSON.stringify(context).includes('awayScore'), false);
  assert.equal(context.context_mode, 'historical_reconstruction');
  assert.equal(context.context_quality, 'market_only');
  assert.deepEqual(context.market.scoreOptions.map((option) => option.score), ['0-0', '0-1', '1-0', '1-1']);
});
