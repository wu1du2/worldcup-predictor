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

const familySeedData = [
  {
    id: 'knockout_stable',
    name: '稳定型',
    shortName: '稳定',
    color: '#126252',
    thesis: '低比分、强队小胜、平局保护，目标是减少离谱亏损。',
    versions: [
      {
        version: 'v0',
        status: 'baseline',
        label: '低比分基线',
        changed: '从小组赛低比分篮子迁移，覆盖 0-0、1-1、1-0、2-1。',
        verdict: '解释清楚但平局偏重，面对强队碾压局不够主动。',
        metrics: { roi: 45, hitRate: 48, coverage: 76, shapeHealth: 58, explainability: 70 },
      },
      {
        version: 'v1',
        status: 'active',
        label: '强队小胜修正',
        changed: '加入强队领先收缩和弱队拖平权重，压低 2-2 暴露。',
        verdict: '总分提升，作为当前稳定型旗舰候选保留。',
        metrics: { roi: 54, hitRate: 52, coverage: 80, shapeHealth: 72, explainability: 78 },
      },
      {
        version: 'v2',
        status: 'discarded',
        label: '过度保守实验',
        changed: '进一步压低总进球，强行提高 0-0/1-1。',
        verdict: '形态单一，容易变成永远买平局，丢弃但保留轨迹。',
        metrics: { roi: 38, hitRate: 50, coverage: 78, shapeHealth: 42, explainability: 74 },
      },
    ],
  },
  {
    id: 'knockout_value',
    name: '价值型',
    shortName: '价值',
    color: '#1f5edc',
    thesis: '用模型概率乘赔率找被低估比分，允许适度冒险。',
    versions: [
      {
        version: 'v0',
        status: 'baseline',
        label: 'Poisson EV 基线',
        changed: '从 context_poisson_ev_v3 迁移，按模型概率和比分赔率计算 EV。',
        verdict: '收益潜力高，但长尾比分需要更强惩罚。',
        metrics: { roi: 50, hitRate: 38, coverage: 74, shapeHealth: 56, explainability: 72 },
      },
      {
        version: 'v1',
        status: 'active',
        label: '长尾冷门约束',
        changed: '加入 20+ 高赔惩罚和单场 2-3 注限制。',
        verdict: '收益略降但形态健康明显变好，保留继续迭代。',
        metrics: { roi: 47, hitRate: 43, coverage: 76, shapeHealth: 76, explainability: 80 },
      },
      {
        version: 'v2',
        status: 'discarded',
        label: '冷门增强实验',
        changed: '放宽高赔限制，优先买赔率被模型低估的冷门比分。',
        verdict: '解释刺激但命中率和形态都变差，暂时丢弃。',
        metrics: { roi: 34, hitRate: 28, coverage: 72, shapeHealth: 39, explainability: 76 },
      },
    ],
  },
  {
    id: 'knockout_consensus',
    name: '共识型',
    shortName: '共识',
    color: '#9b4d16',
    thesis: '综合机构明确比分、市场方向和赔率低位，目标是人类读得懂。',
    versions: [
      {
        version: 'v0',
        status: 'baseline',
        label: '来源共识基线',
        changed: '沿用 market_consensus_sources，明确比分来源直接加权。',
        verdict: '解释性最好，但覆盖依赖赛前来源数量。',
        metrics: { roi: 42, hitRate: 40, coverage: 48, shapeHealth: 66, explainability: 92 },
      },
      {
        version: 'v1',
        status: 'active',
        label: '来源不足补位',
        changed: '来源少于 3 条时，用赔率低位和 BTTS/大小球方向补足。',
        verdict: '覆盖率提升，解释性仍然强，作为当前共识型旗舰保留。',
        metrics: { roi: 46, hitRate: 42, coverage: 70, shapeHealth: 70, explainability: 90 },
      },
      {
        version: 'v2',
        status: 'discarded',
        label: '强追机构比分',
        changed: '大幅提高单个机构明确比分权重。',
        verdict: '容易被孤立观点带偏，冲突来源时不稳，丢弃。',
        metrics: { roi: 31, hitRate: 34, coverage: 66, shapeHealth: 52, explainability: 86 },
      },
    ],
  },
];

export function getKnockoutMetricLabels() {
  return metricLabels.map((metric) => ({ ...metric }));
}

export function getKnockoutStrategyFamilies() {
  return familySeedData.map((family) => ({
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
