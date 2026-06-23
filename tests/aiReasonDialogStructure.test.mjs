import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function componentSource(name, nextName) {
  return mainSource.slice(
    mainSource.indexOf(`function ${name}`),
    mainSource.indexOf(`function ${nextName}`),
  );
}

test('AI recommendation is a score badge, not a selectable user or reason panel', () => {
  assert.match(mainSource, /const selectablePlayers = players\.filter\(\(player\) => !isAiPlayer\(player\)\)/);
  assert.match(mainSource, /const aiPlayer = players\.find\(\(player\) => isAiPlayer\(player\)\)/);
  assert.match(mainSource, /const aiPredictions = aiPlayer \? state\.predictions\?\.\[aiPlayer\.id\] \|\| {} : {}/);
  assert.match(mainSource, /selectablePlayers\.map/);
  assert.doesNotMatch(mainSource, /const selectedPlayerIsAi/);
  assert.doesNotMatch(mainSource, /function AiReasonDialog/);
  assert.doesNotMatch(stylesSource, /ai-reason/);
});

test('AI recommended scores render a star inside score options', () => {
  const matchCardSource = componentSource('MatchCard', 'AddPlayerDialog');
  const starIndex = matchCardSource.indexOf('className="ai-recommendation-star"');
  const scoreGridIndex = matchCardSource.indexOf('className="score-grid"');

  assert.match(mainSource, /recommendedScores={aiPredictions\[match\.id\] \|\| \[\]}/);
  assert.match(matchCardSource, /recommendedScores\.includes\(option\.score\)/);
  assert.ok(scoreGridIndex < starIndex);
});
