import test from 'node:test';
import assert from 'node:assert/strict';

import { loadStaticSnapshot, normalizeStaticSnapshot } from '../src/staticSnapshot.mjs';

test('normalizeStaticSnapshot keeps public board data and defaults missing maps', () => {
  const snapshot = normalizeStaticSnapshot({
    generatedAt: '2026-06-30T00:00:00.000Z',
    matches: [{ id: 'm1', date: '2026-07-01' }],
    scoreOddsByMatch: { m1: [{ score: '1-0', odds: 5.5 }] },
    aiRecommendationsByMatch: { m1: { scores: ['1-0'] } },
  });

  assert.deepEqual(snapshot, {
    generatedAt: '2026-06-30T00:00:00.000Z',
    oddsWindow: null,
    matches: [{ id: 'm1', date: '2026-07-01' }],
    scoreOddsByMatch: { m1: [{ score: '1-0', odds: 5.5 }] },
    aiRecommendationsByMatch: { m1: { scores: ['1-0'] } },
  });
});

test('loadStaticSnapshot returns null when the static file is unavailable', async () => {
  const snapshot = await loadStaticSnapshot({
    fetchImpl: async () => new Response('', { status: 404 }),
  });

  assert.equal(snapshot, null);
});
