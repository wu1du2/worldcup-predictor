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
  assert.match(stylesSource, /\.ai-detail-section p[\s\S]*white-space: pre-wrap/);
});

test('AI recommended scores render a star inside score options', () => {
  const matchCardSource = componentSource('MatchCard', 'AddPlayerDialog');
  const starIndex = matchCardSource.indexOf('className="ai-recommendation-star"');
  const scoreGridIndex = matchCardSource.indexOf('className="score-grid"');

  assert.match(mainSource, /buildAiStrategyTabsForMatch/);
  assert.match(mainSource, /const activeRecommendedScores = activeStrategyRecommendation\?\.scores \|\| recommendedScores \|\| \[\]/);
  assert.match(matchCardSource, /activeRecommendedScores\.includes\(option\.score\)/);
  assert.ok(scoreGridIndex < starIndex);
});

test('match cards expose three AI strategy tabs and keep router reason scoped to routed tab', () => {
  const matchCardSource = componentSource('MatchCard', 'AddPlayerDialog');

  assert.match(matchCardSource, /className="ai-strategy-tabs"/);
  assert.match(matchCardSource, /strategyTabs\.map/);
  assert.match(matchCardSource, /data-ai-strategy-tab/);
  assert.match(matchCardSource, /tab\.isRouterPick/);
  assert.match(matchCardSource, /activeStrategyTabId/);
  assert.match(stylesSource, /\.ai-strategy-tabs/);
  assert.match(stylesSource, /\.ai-strategy-tab\.selected/);
});

test('dialog backdrops close on blank area while AI strategy input dialog is protected', () => {
  assert.match(mainSource, /function DialogBackdrop/);
  assert.match(mainSource, /event\.target === event\.currentTarget/);
  assert.match(mainSource, /dismissOnBackdrop = true/);
  assert.match(mainSource, /<DialogBackdrop ariaLabel="AI策略" onClose={onClose} dismissOnBackdrop={false}>/);
  assert.match(mainSource, /<DialogBackdrop ariaLabel="AI推荐详情" onClose={onClose}>/);
});

test('AI leaderboard is a topbar action and strategy submission lives in the more menu', () => {
  const topbarSource = mainSource.slice(
    mainSource.indexOf('<header className="topbar">'),
    mainSource.indexOf('<section className="date-panel"'),
  );
  const moreMenuSource = componentSource('MoreMenuDialog', 'MatchCard');

  assert.match(topbarSource, /预测结果/);
  assert.match(topbarSource, /AI排行榜/);
  assert.match(topbarSource, /data-action="ai-strategy-leaderboard"/);
  assert.doesNotMatch(topbarSource, /data-action="open-ai-strategy"/);
  assert.match(moreMenuSource, /AI策略/);
  assert.match(moreMenuSource, /data-action="open-ai-strategy"/);
  assert.doesNotMatch(moreMenuSource, /AI预测排行榜/);
  assert.match(mainSource, /function AiStrategyDialog/);
  assert.match(mainSource, /data-action="submit-ai-strategy"/);
  assert.match(mainSource, /function AiStrategyLeaderboardDialog/);
  assert.match(stylesSource, /\.strategy-dialog/);
  assert.match(stylesSource, /\.strategy-rank-dialog/);
});

test('AI leaderboard highlights the top three strategies', () => {
  const leaderboardSource = componentSource('AiStrategyLeaderboardDialog', 'ExportDialog');

  assert.match(leaderboardSource, /getAiStrategyRankMeta/);
  assert.match(leaderboardSource, /rankMeta\.top \? 'top-rank'/);
  assert.match(leaderboardSource, /strategy-rank-medal/);
  assert.match(stylesSource, /\.strategy-rank-item\.top-rank/);
  assert.match(stylesSource, /\.strategy-rank-medal/);
});
