import { knockoutStrategyEvolutionFamilies } from './knockoutStrategyEvolutionData.mjs';

const scoreWeights = {
  roi: 0.35,
  hitRate: 0.2,
  coverage: 0.15,
  shapeHealth: 0.15,
  explainability: 0.15,
};

const metricLabels = [
  { id: 'total', label: '总分' },
  { id: 'roi', label: '收益' },
  { id: 'hitRate', label: '命中' },
  { id: 'coverage', label: '覆盖' },
  { id: 'shapeHealth', label: '形态' },
  { id: 'explainability', label: '解释' },
];

export function getKnockoutMetricLabels() {
  return metricLabels.map((metric) => ({ ...metric }));
}

export function getKnockoutStrategyFamilies() {
  return knockoutStrategyEvolutionFamilies.map((family) => ({
    ...family,
    versions: family.versions.map((version) => ({
      ...version,
      metrics: { ...version.metrics },
      totalScore: getKnockoutTotalScore(version.metrics),
    })),
  }));
}

export function getKnockoutTotalScore(metrics) {
  const total = Object.entries(scoreWeights).reduce((sum, [key, weight]) => {
    return sum + Number(metrics?.[key] || 0) * weight;
  }, 0);
  return Math.round((total + Number.EPSILON) * 10) / 10;
}

export function getKnockoutVersionPoints(families = getKnockoutStrategyFamilies(), metricId = 'total') {
  return families.map((family) => ({
    familyId: family.id,
    name: family.shortName || family.name,
    color: family.color,
    points: family.versions.map((version, index) => ({
      x: index,
      version: version.version,
      status: version.status,
      label: version.label,
      value: metricId === 'total' ? version.totalScore : Number(version.metrics?.[metricId] || 0),
    })),
  }));
}
