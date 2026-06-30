import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeLiveBoardSnapshot } from '../src/liveBoard.mjs';

test('mergeLiveBoardSnapshot replaces only the live-window matches and keeps static history', () => {
  const merged = mergeLiveBoardSnapshot({
    generatedAt: 'static',
    matches: [
      { id: 'old', date: '2026-06-29', time: '01:00', home: '旧队', away: '旧队2', status: 'post' },
      { id: 'live-1', date: '2026-06-30', time: '01:00', home: '巴西', away: '日本', status: 'pre' },
    ],
    scoreOddsByMatch: { old: [{ score: '1-0', odds: 7 }] },
    aiRecommendationsByMatch: { old: { scores: ['1-0'] } },
  }, {
    generatedAt: 'live',
    window: { from: '2026-06-30', to: '2026-07-02' },
    matches: [
      { id: 'live-1', date: '2026-06-30', time: '01:00', home: '巴西', away: '日本', status: 'post', homeScore: 2, awayScore: 1 },
    ],
    scoreOddsByMatch: { 'live-1': [{ score: '2-1', odds: 5.8 }] },
    aiRecommendationsByMatch: { 'live-1': { scores: ['2-1'] } },
    importReports: [{ id: 'r1', jobName: 'live-d1' }],
  });

  assert.deepEqual(merged.matches.map((match) => [match.id, match.status, match.homeScore]), [
    ['old', 'post', undefined],
    ['live-1', 'post', 2],
  ]);
  assert.deepEqual(merged.scoreOddsByMatch, {
    old: [{ score: '1-0', odds: 7 }],
    'live-1': [{ score: '2-1', odds: 5.8 }],
  });
  assert.deepEqual(merged.aiRecommendationsByMatch['live-1'].scores, ['2-1']);
  assert.deepEqual(merged.importReports, [{ id: 'r1', jobName: 'live-d1' }]);
});

test('mergeLiveBoardSnapshot keeps static odds trends when live odds omit trend metadata', () => {
  const merged = mergeLiveBoardSnapshot({
    matches: [{ id: 'm1', date: '2026-07-01', time: '01:00', status: 'pre' }],
    scoreOddsByMatch: {
      m1: [
        { score: '1-0', odds: 12, trend: { firstOdds: 10, latestOdds: 12, changePct: 20, snapshotsCount: 5 } },
        { score: '0-0', odds: 8, trend: { firstOdds: 8, latestOdds: 8, changePct: 0, snapshotsCount: 5 } },
      ],
    },
  }, {
    matches: [{ id: 'm1', date: '2026-07-01', time: '01:00', status: 'pre' }],
    scoreOddsByMatch: {
      m1: [
        { score: '1-0', odds: 13 },
        { score: '0-0', odds: 7.5, trend: { firstOdds: 8, latestOdds: 7.5, changePct: -6.25, snapshotsCount: 6 } },
      ],
    },
  });

  assert.deepEqual(merged.scoreOddsByMatch.m1, [
    { score: '1-0', odds: 13, trend: { firstOdds: 10, latestOdds: 12, changePct: 20, snapshotsCount: 5 } },
    { score: '0-0', odds: 7.5, trend: { firstOdds: 8, latestOdds: 7.5, changePct: -6.25, snapshotsCount: 6 } },
  ]);
});
