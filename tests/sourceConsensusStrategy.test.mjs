import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSourceConsensusSelection,
  getExternalPredictionStrength,
} from '../src/sourceConsensusStrategy.mjs';

const brazilJapanOdds = [
  { score: '1-0', odds: 6.25 },
  { score: '1-1', odds: 6.25 },
  { score: '2-1', odds: 6.5 },
  { score: '2-0', odds: 7 },
  { score: '0-0', odds: 10 },
  { score: '3-1', odds: 11 },
  { score: '3-0', odds: 12 },
  { score: '0-1', odds: 13 },
  { score: '2-2', odds: 14 },
  { score: '1-2', odds: 14 },
];

const sourceContext = {
  externalPredictions: [
    {
      source: 'CBS',
      kind: 'score',
      score: '2-1',
      outcome: 'home',
      note: 'Brazil 2, Japan 1',
    },
    {
      source: 'Ladbrokes',
      kind: 'score',
      score: '3-1',
      outcome: 'home',
      totalLean: 'over',
      bothTeamsScore: true,
      note: 'Brazil 3-1 Japan',
    },
    {
      source: 'BetMGM',
      kind: 'market',
      outcome: 'home',
      bothTeamsScore: true,
      note: 'Both teams to score, Brazil attack favored.',
    },
    {
      source: 'DraftKings',
      kind: 'market',
      outcome: 'home',
      totalLean: 'under',
      note: 'Brazil favorite; under 2.5 favored.',
    },
  ],
};

test('buildSourceConsensusSelection combines explicit scores, source direction, and odds', () => {
  const selection = buildSourceConsensusSelection({
    odds: brazilJapanOdds,
    context: sourceContext,
  });

  assert.deepEqual(selection.picks.map((pick) => pick.score), ['2-1', '3-1', '1-0']);
  assert.equal(selection.picks[0].sourceScore > selection.picks[2].sourceScore, true);
  assert.match(selection.picks[0].reason, /CBS/);
  assert.match(selection.picks[1].reason, /Ladbrokes/);
  assert.match(selection.summary, /机构明确比分/);
});

test('buildSourceConsensusSelection falls back to odds consensus without external sources', () => {
  const selection = buildSourceConsensusSelection({
    odds: brazilJapanOdds,
    context: {},
  });

  assert.deepEqual(selection.picks.map((pick) => pick.score), ['1-0', '1-1', '2-1']);
  assert.equal(selection.sourceCount, 0);
});

test('getExternalPredictionStrength measures usable source consensus', () => {
  assert.equal(getExternalPredictionStrength(sourceContext), 4);
  assert.equal(getExternalPredictionStrength({ externalPredictions: [{ source: 'Noise' }] }), 0);
});
