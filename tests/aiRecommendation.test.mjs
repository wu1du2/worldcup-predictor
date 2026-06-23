import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAiRecommendedScores,
  getAiRecommendationForMatch,
  getAiReasonPreview,
  isAiPlayer,
} from '../src/aiRecommendation.mjs';

test('isAiPlayer recognizes the special AI player', () => {
  assert.equal(isAiPlayer({ id: 'p1', name: 'AI推荐' }), true);
  assert.equal(isAiPlayer({ id: 'p1', name: '张三' }), false);
  assert.equal(isAiPlayer(null), false);
});

test('getAiRecommendationForMatch reads recommendation by match id', () => {
  const recommendation = getAiRecommendationForMatch('espn-760437');

  assert.equal(recommendation?.matchId, 'espn-760437');
  assert.equal(recommendation.roiLabel, '+1.25%');
  assert.deepEqual(recommendation.scores, ['0-0', '0-1', '1-0', '1-1']);
  assert.match(recommendation.reason, /英格兰是明确热门/);
});

test('getAiRecommendedScores exposes score recommendations for option badges', () => {
  assert.deepEqual(getAiRecommendedScores('espn-760437'), ['0-0', '0-1', '1-0', '1-1']);
  assert.deepEqual(getAiRecommendedScores('missing-match'), []);
});

test('getAiReasonPreview keeps summary and detail within UI limits', () => {
  const reason = '英格兰是明确热门，但克罗地亚经验强，市场也偏向谨慎开局，因此保留低比分篮子。'.repeat(20);
  const preview = getAiReasonPreview(reason, { roiLabel: '+1.25%' });

  assert.equal(preview.roiText, '历史ROI +1.25%');
  assert.ok(preview.summary.length <= 70);
  assert.ok(preview.detail.length <= 400);
  assert.match(preview.summary, /^英格兰是明确热门/);
  assert.doesNotMatch(preview.summary, /历史ROI/);
  assert.doesNotMatch(preview.detail, /历史ROI/);
  assert.match(preview.summary, /…$/);
  assert.match(preview.detail, /…$/);
});
