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

test('AI recommendation is a score badge and reason entry, not a selectable user', () => {
  assert.match(mainSource, /const selectablePlayers = players\.filter\(\(player\) => !isAiPlayer\(player\)\)/);
  assert.match(mainSource, /const aiPlayer = players\.find\(\(player\) => isAiPlayer\(player\)\)/);
  assert.match(mainSource, /const aiPredictions = aiPlayer \? state\.predictions\?\.\[aiPlayer\.id\] \|\| {} : {}/);
  assert.match(mainSource, /selectablePlayers\.map/);
  assert.doesNotMatch(mainSource, /const selectedPlayerIsAi/);
  assert.match(mainSource, /function AiRecommendationDialog/);
  assert.match(mainSource, /className="ai-summary-button"/);
  assert.match(mainSource, /理由 \{aiPreview\.summary\}/);
  assert.match(mainSource, /aria-hidden="true">›/);
  assert.match(stylesSource, /\.ai-summary-button/);
  assert.match(stylesSource, /\.ai-detail-dialog/);
});

test('AI recommended scores render a star inside score options', () => {
  const matchCardSource = componentSource('MatchCard', 'AddPlayerDialog');
  const starIndex = matchCardSource.indexOf('className="ai-recommendation-star"');
  const scoreGridIndex = matchCardSource.indexOf('className="score-grid"');

  assert.match(mainSource, /recommendedScores={recommendation\?\.scores \|\| aiPredictions\[match\.id\] \|\| \[\]}/);
  assert.match(matchCardSource, /recommendedScores\.includes\(option\.score\)/);
  assert.ok(scoreGridIndex < starIndex);
});

test('AI strategy collection and leaderboard have mobile menu entries', () => {
  assert.match(mainSource, /预测结果/);
  assert.match(mainSource, /AI策略/);
  assert.match(mainSource, /function AiStrategyDialog/);
  assert.match(mainSource, /data-action="submit-ai-strategy"/);
  assert.match(mainSource, /function AiStrategyLeaderboardDialog/);
  assert.match(mainSource, /data-action="ai-strategy-leaderboard"/);
  assert.match(stylesSource, /\.strategy-dialog/);
  assert.match(stylesSource, /\.strategy-rank-dialog/);
});
