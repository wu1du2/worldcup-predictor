import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAiPredictionEntries } from '../src/aiPredictionSync.mjs';

test('buildAiPredictionEntries converts a single prediction log into database entries', () => {
  const log = {
    match_context_file: '../match_info/2026-06-18_英格兰_vs_克罗地亚/context.json',
    prediction: {
      stakes: [
        { score: '0-0', stake: 1 },
        { score: '0-1', stake: 1 },
        { score: '1-0', stake: 1 },
        { score: '1-1', stake: 1 },
      ],
    },
  };
  const contextsByFile = {
    '../match_info/2026-06-18_英格兰_vs_克罗地亚/context.json': {
      match: { id: 'espn-760437' },
    },
  };

  assert.deepEqual(buildAiPredictionEntries({ predictionLog: log, contextsByFile }), [
    {
      matchId: 'espn-760437',
      scores: ['0-0', '0-1', '1-0', '1-1'],
    },
  ]);
});

test('buildAiPredictionEntries supports batch prediction logs', () => {
  const predictionLog = {
    predictions: [
      {
        match_context_file: '../match_info/a/context.json',
        prediction: { stakes: [{ score: '1-0', stake: 1 }] },
      },
      {
        match_context_file: '../match_info/b/context.json',
        prediction: { stakes: [{ score: '2-1', stake: 1 }, { score: '1-1', stake: 1 }] },
      },
    ],
  };
  const contextsByFile = {
    '../match_info/a/context.json': { match: { id: 'match-a' } },
    '../match_info/b/context.json': { match: { id: 'match-b' } },
  };

  assert.deepEqual(buildAiPredictionEntries({ predictionLog, contextsByFile }), [
    { matchId: 'match-a', scores: ['1-0'] },
    { matchId: 'match-b', scores: ['2-1', '1-1'] },
  ]);
});
