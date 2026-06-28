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
        label: '低比分篮子',
        changed: '代理样本 56 场：固定覆盖 0-0、0-1、1-0、1-1。',
        verdict: '命中覆盖还可以，但单场 4 注成本偏高，ROI 为负。',
        metrics: { roi: 45.5, hitRate: 37.5, coverage: 100, shapeHealth: 70, explainability: 70 },
      },
      {
        version: 'v1',
        status: 'active',
        label: '平局锚点 4 格',
        changed: '代理样本 56 场：平局低位时覆盖 1-1、2-2、0-0、1-0，否则回落到三格。',
        verdict: 'ROI +9.94%，总分 70.5，作为当前稳定型旗舰候选保留。',
        metrics: { roi: 69.9, hitRate: 32.1, coverage: 100, shapeHealth: 86, explainability: 78 },
      },
      {
        version: 'v2',
        status: 'discarded',
        label: '热门平局保护',
        changed: '代理样本 56 场：热门小胜为主，同时保留 1-1。',
        verdict: '命中 19/56 但亏损太深，说明热门方向在代理样本中过度暴露。',
        metrics: { roi: 12, hitRate: 33.9, coverage: 100, shapeHealth: 70, explainability: 78 },
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
        label: '赛前泊松EV基础',
        changed: '代理样本 56 场：用赛前 context 估计期望进球，再按 EV 排序。',
        verdict: '可解释性较强，但选项偏多，ROI -21.84%。',
        metrics: { roi: 38.2, hitRate: 16.1, coverage: 100, shapeHealth: 76, explainability: 84 },
      },
      {
        version: 'v1',
        status: 'active',
        label: '赛前泊松EV精选',
        changed: '代理样本 56 场：提高概率门槛并限制最多 2 个比分。',
        verdict: 'ROI -2.31%，成本控制明显更好，作为当前价值型候选保留。',
        metrics: { roi: 57.7, hitRate: 10.7, coverage: 100, shapeHealth: 88, explainability: 84 },
      },
      {
        version: 'v2',
        status: 'discarded',
        label: '市场泊松高波动',
        changed: '代理样本 56 场：用比分赔率反推市场进球分布再寻找高 EV。',
        verdict: '理论漂亮但样本命中 2/56，波动过大，暂时丢弃。',
        metrics: { roi: 18.3, hitRate: 3.6, coverage: 100, shapeHealth: 96, explainability: 84 },
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
        label: '最低赔率三项',
        changed: '代理样本 56 场：直接购买市场最低赔率的三个比分。',
        verdict: '命中 22/56，但赔率太低仍然亏损。',
        metrics: { roi: 38.9, hitRate: 39.3, coverage: 100, shapeHealth: 90, explainability: 70 },
      },
      {
        version: 'v1',
        status: 'active',
        label: '来源不足补位',
        changed: '代理样本 56 场：综合机构明确比分、方向型预测和赔率低位。',
        verdict: '收益与最低赔率相同，但解释性更强，适合作为用户可读推荐。',
        metrics: { roi: 38.9, hitRate: 39.3, coverage: 100, shapeHealth: 90, explainability: 90 },
      },
      {
        version: 'v2',
        status: 'discarded',
        label: '四格共识扩展',
        changed: '代理样本 56 场：最低赔率四项，覆盖更宽。',
        verdict: '命中 25/56 但成本过高，ROI 继续走低，丢弃。',
        metrics: { roi: 29.3, hitRate: 44.6, coverage: 100, shapeHealth: 70, explainability: 90 },
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
