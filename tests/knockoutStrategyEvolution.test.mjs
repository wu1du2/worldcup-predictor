import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getKnockoutMetricLabels,
  getKnockoutStrategyFamilies,
  getKnockoutTotalScore,
  getKnockoutVersionPoints,
} from '../src/knockoutStrategyEvolution.mjs';

test('knockout strategy evolution keeps all three flagship families', () => {
  const families = getKnockoutStrategyFamilies();

  assert.deepEqual(families.map((family) => family.id), [
    'knockout_stable',
    'knockout_value',
    'knockout_consensus',
  ]);
  assert.ok(families.every((family) => family.versions.length >= 2));
});

test('knockout strategy evolution retains failed versions as visible iterations', () => {
  const families = getKnockoutStrategyFamilies();
  const allVersions = families.flatMap((family) => family.versions);

  assert.ok(allVersions.some((version) => version.status === 'discarded'));
  assert.ok(allVersions.some((version) => version.status === 'active'));
});

test('getKnockoutTotalScore uses the weighted proxy scoring contract', () => {
  assert.equal(getKnockoutTotalScore({
    roi: 60,
    hitRate: 50,
    coverage: 80,
    shapeHealth: 70,
    explainability: 90,
    exploration: 80,
  }), 71.5);
});

test('getKnockoutTotalScore falls back to explainability for legacy exploration metrics', () => {
  assert.equal(getKnockoutTotalScore({
    roi: 60,
    hitRate: 50,
    coverage: 80,
    shapeHealth: 70,
    explainability: 90,
  }), 73);
});

test('getKnockoutVersionPoints returns metric series for chart rendering', () => {
  const families = getKnockoutStrategyFamilies();
  const totalPoints = getKnockoutVersionPoints(families, 'total');
  const roiPoints = getKnockoutVersionPoints(families, 'roi');

  assert.equal(totalPoints.length, 3);
  assert.ok(totalPoints.every((series) => series.points.length >= 2));
  assert.ok(totalPoints.every((series) => series.points.every((point) => point.version)));
  assert.ok(roiPoints.some((series) => series.points.some((point) => point.status === 'discarded')));
});

test('getKnockoutMetricLabels exposes the visible metric tabs', () => {
  assert.deepEqual(getKnockoutMetricLabels().map((metric) => metric.id), [
    'total',
    'roi',
    'hitRate',
    'coverage',
    'shapeHealth',
    'explainability',
    'exploration',
  ]);
});
