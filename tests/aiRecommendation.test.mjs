import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
  assert.match(recommendation.reason, /低比分篮子/);
});

test('getAiReasonPreview keeps summary and detail within UI limits', () => {
  const reason = '英格兰是明确热门，但克罗地亚经验强，市场也偏向谨慎开局，因此保留低比分篮子。'.repeat(20);
  const preview = getAiReasonPreview(reason);

  assert.ok(preview.summary.length <= 50);
  assert.ok(preview.detail.length <= 400);
  assert.match(preview.summary, /…$/);
  assert.match(preview.detail, /…$/);
});
