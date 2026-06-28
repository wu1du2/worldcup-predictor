import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('more menu exposes the knockout strategy evolution entry', () => {
  assert.match(mainSource, /淘汰赛策略/);
  assert.match(mainSource, /data-action="open-knockout-strategy"/);
  assert.match(mainSource, /KnockoutStrategyDialog/);
});

test('knockout strategy dialog renders total and metric evolution charts', () => {
  assert.match(mainSource, /function KnockoutStrategyDialog/);
  assert.match(mainSource, /function StrategyEvolutionChart/);
  assert.match(mainSource, /getKnockoutVersionPoints\(families, selectedMetric\)/);
  assert.match(mainSource, /data-knockout-total-chart/);
  assert.match(mainSource, /data-knockout-metric-chart/);
});

test('knockout strategy dialog keeps failed iterations visible', () => {
  assert.match(mainSource, /point\.status === 'discarded'/);
  assert.match(mainSource, /strategy-version-item \$\{version\.status\}/);
  assert.match(mainSource, /失败实验/);
  assert.match(stylesSource, /\.strategy-version-item\.discarded/);
  assert.match(stylesSource, /\.chart-point\.discarded/);
});
