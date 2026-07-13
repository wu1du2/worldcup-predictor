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

test('topbar exposes result exports while AI leaderboard lives in the more menu', () => {
  const topbarSource = mainSource.slice(
    mainSource.indexOf('<header className="topbar">'),
    mainSource.indexOf('<section className="date-panel"'),
  );
  const moreMenuSource = componentSource('MoreMenuDialog', 'MatchCard');

  assert.match(topbarSource, /比分结果/);
  assert.doesNotMatch(topbarSource, /四强之路/);
  assert.doesNotMatch(topbarSource, /让球结果/);
  assert.doesNotMatch(topbarSource, /data-action="handicap-results"/);
  assert.doesNotMatch(topbarSource, /晋级结果/);
  assert.doesNotMatch(topbarSource, /data-action="advancement-results"/);
  assert.doesNotMatch(topbarSource, /AI排行榜/);
  assert.doesNotMatch(topbarSource, /data-action="ai-strategy-leaderboard"/);
  assert.doesNotMatch(topbarSource, /data-action="open-ai-strategy"/);
  assert.match(moreMenuSource, /AI排行榜/);
  assert.match(moreMenuSource, /data-action="ai-strategy-leaderboard"/);
  assert.match(moreMenuSource, /晋级预测/);
  assert.match(moreMenuSource, /晋级结果/);
  assert.match(moreMenuSource, /data-action="open-advancement-predictions"/);
  assert.match(moreMenuSource, /data-action="advancement-results"/);
  assert.match(moreMenuSource, /冠军之路结果/);
  assert.match(moreMenuSource, /data-action="champion-road-results"/);
  assert.match(moreMenuSource, /四强之路/);
  assert.match(moreMenuSource, /data-action="handicap-results"/);
  assert.match(moreMenuSource, /AI策略/);
  assert.match(moreMenuSource, /data-action="open-ai-strategy"/);
  assert.match(mainSource, /function AiStrategyDialog/);
  assert.match(mainSource, /data-action="submit-ai-strategy"/);
  assert.match(mainSource, /function AiStrategyLeaderboardDialog/);
  assert.match(stylesSource, /\.strategy-dialog/);
  assert.match(stylesSource, /\.strategy-rank-dialog/);
});

test('champion road entry is an inviting ranking card below player picker', () => {
  const entrySource = mainSource.slice(
    mainSource.indexOf('<section className="advancement-entry-panel"'),
    mainSource.indexOf("{loadStatus !== 'ready'"),
  );

  assert.match(entrySource, /<strong>冠军之路<\/strong>/);
  assert.doesNotMatch(entrySource, /四强之路，舍你其谁/);
  assert.match(entrySource, /拖动四队，排出冠军到第四名/);
  assert.match(entrySource, /已排 \$\{championRankedCount\}\/\$\{championDialog\.teams\.length\}/);
  assert.match(entrySource, /data-action="open-champion-road"/);
  assert.match(mainSource, /function ChampionRoadDialog/);
  assert.match(mainSource, /data-action="save-champion-road"/);
  assert.match(mainSource, /className="handicap-payout-highlight"/);
  assert.match(mainSource, /固定成本15/);
  assert.match(stylesSource, /\.advancement-entry-panel[\s\S]*margin-top: 14px/);
  assert.match(stylesSource, /\.advancement-entry-button[\s\S]*min-height: 50px/);
  assert.match(stylesSource, /\.champion-entry-button/);
  assert.match(stylesSource, /\.champion-rank-row/);
  assert.match(stylesSource, /\.handicap-choice-button[\s\S]*min-height: 54px/);
  assert.match(stylesSource, /\.handicap-entry-button/);
  assert.match(stylesSource, /\.handicap-payout-highlight/);
});

test('AI leaderboard highlights the top three strategies', () => {
  const leaderboardSource = componentSource('AiStrategyLeaderboardDialog', 'ExportDialog');

  assert.match(leaderboardSource, /getAiStrategyRankMeta/);
  assert.match(leaderboardSource, /rankMeta\.top \? 'top-rank'/);
  assert.match(leaderboardSource, /strategy-rank-medal/);
  assert.match(stylesSource, /\.strategy-rank-item\.top-rank/);
  assert.match(stylesSource, /\.strategy-rank-medal/);
});

test('AI leaderboard opens strategy hit detail rows sorted by ROI', () => {
  const leaderboardSource = componentSource('AiStrategyLeaderboardDialog', 'ExportDialog');
  const detailSource = componentSource('AiStrategyHitDetailDialog', 'ExportDialog');

  assert.match(mainSource, /getAiStrategyHitDetail/);
  assert.match(leaderboardSource, /data-action="open-ai-strategy-detail"/);
  assert.match(leaderboardSource, /onOpenDetail\(row\)/);
  assert.match(detailSource, /data-ai-strategy-hit-detail-dialog/);
  assert.match(detailSource, /detail\.hits\.map/);
  assert.match(detailSource, /单场/);
  assert.match(stylesSource, /\.strategy-hit-dialog/);
  assert.match(stylesSource, /\.strategy-hit-row/);
});
