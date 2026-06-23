import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDefaultAiPredictionEntries,
  defaultAiPredictionScores,
} from '../src/aiPredictionBatch.mjs';

test('buildDefaultAiPredictionEntries creates one AI prediction for every match', () => {
  const entries = buildDefaultAiPredictionEntries({
    matches: [
      { id: 'match-a' },
      { id: 'match-b' },
      { id: '' },
      null,
    ],
  });

  assert.deepEqual(entries, [
    { matchId: 'match-a', scores: defaultAiPredictionScores },
    { matchId: 'match-b', scores: defaultAiPredictionScores },
  ]);
});

test('buildDefaultAiPredictionEntries deduplicates configured scores', () => {
  assert.deepEqual(
    buildDefaultAiPredictionEntries({
      matches: [{ id: 'match-a' }],
      scores: ['1-0', '1-0', '1-1'],
    }),
    [{ matchId: 'match-a', scores: ['1-0', '1-1'] }],
  );
});

test('buildDefaultAiPredictionEntries rejects empty score lists', () => {
  assert.throws(
    () => buildDefaultAiPredictionEntries({ matches: [{ id: 'match-a' }], scores: [] }),
    /must not be empty/,
  );
});
