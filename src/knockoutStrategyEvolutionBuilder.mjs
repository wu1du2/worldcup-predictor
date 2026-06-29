const baseFamilies = [
  {
    id: 'knockout_stable',
    name: '稳定型',
    shortName: '稳定',
    color: '#126252',
    thesis: '低比分、强队小胜、平局保护，目标是减少离谱亏损。',
    experimentFamily: 'draw_anchor',
    versions: [
      {
        strategyId: 'low_score_basket_4',
        version: 'v0',
        status: 'baseline',
        label: '低比分篮子',
        changed: ({ proxyMatches }) => `代理样本 ${proxyMatches} 场：固定覆盖 0-0、0-1、1-0、1-1。`,
      },
      {
        strategyId: 'tem_draw_anchor_3_max5_5',
        version: 'v1',
        status: 'discarded',
        label: '平局锚点 4 格',
        changed: ({ proxyMatches }) => `代理样本 ${proxyMatches} 场：平局低位时覆盖 1-1、2-2、0-0、1-0，否则回落到三格。`,
      },
      {
        strategyId: 'favorite_draw_saver_4',
        version: 'v2',
        status: 'discarded',
        label: '热门平局保护',
        changed: ({ proxyMatches }) => `代理样本 ${proxyMatches} 场：热门小胜为主，同时保留 1-1。`,
      },
      {
        strategyId: 'tem_draw_anchor_lean_homeaway2_draw6_cap22',
        version: 'v3',
        status: 'active',
        label: '平局锚点省注',
        changed: ({ proxyMatches }) => `代理样本 ${proxyMatches} 场：固定保留 1-1/0-0；平局低于 6 时加入两个最低赔非平局保护，并过滤 22 倍以上长尾。`,
      },
    ],
  },
  {
    id: 'knockout_value',
    name: '价值型',
    shortName: '价值',
    color: '#1f5edc',
    thesis: '用模型概率乘赔率找被低估比分，允许适度冒险。',
    experimentFamily: 'poisson_ev',
    versions: [
      {
        strategyId: 'context_poisson_ev',
        version: 'v0',
        status: 'baseline',
        label: '赛前泊松EV基础',
        changed: ({ proxyMatches }) => `代理样本 ${proxyMatches} 场：用赛前 context 估计期望进球，再按 EV 排序。`,
      },
      {
        strategyId: 'context_poisson_ev_v2',
        version: 'v1',
        status: 'discarded',
        label: '赛前泊松EV精选',
        changed: ({ proxyMatches }) => `代理样本 ${proxyMatches} 场：提高概率门槛并限制最多 2 个比分。`,
      },
      {
        strategyId: 'market_poisson_ev',
        version: 'v2',
        status: 'discarded',
        label: '市场泊松高波动',
        changed: ({ proxyMatches }) => `代理样本 ${proxyMatches} 场：用比分赔率反推市场进球分布再寻找高 EV。`,
      },
      {
        strategyId: 'tem_poisson_drawguard_context_v3_n2_draw7_5_cap35_p0_006',
        version: 'v3',
        status: 'active',
        label: '赛前泊松EV平局保护',
        changed: ({ proxyMatches }) => `代理样本 ${proxyMatches} 场：先取两个赛前泊松多样性 EV 候选；若 1-1 不高于 7.5 倍，则加入平局保护。`,
      },
    ],
  },
  {
    id: 'knockout_consensus',
    name: '共识型',
    shortName: '共识',
    color: '#9b4d16',
    thesis: '综合机构明确比分、市场方向和赔率低位，目标是人类读得懂。',
    experimentFamily: 'market_consensus',
    versions: [
      {
        strategyId: 'lowest_odds_3',
        version: 'v0',
        status: 'baseline',
        label: '最低赔率三项',
        changed: ({ proxyMatches }) => `代理样本 ${proxyMatches} 场：直接购买市场最低赔率的三个比分。`,
      },
      {
        strategyId: 'market_consensus_sources',
        version: 'v1',
        status: 'discarded',
        label: '来源不足补位',
        changed: ({ proxyMatches }) => `代理样本 ${proxyMatches} 场：综合机构明确比分、方向型预测和赔率低位。`,
      },
      {
        strategyId: 'market_consensus_4',
        version: 'v2',
        status: 'discarded',
        label: '四格共识扩展',
        changed: ({ proxyMatches }) => `代理样本 ${proxyMatches} 场：最低赔率四项，覆盖更宽。`,
      },
      {
        strategyId: 'tem_source_consensus_poisson_context_v1_s2_c3_n3_cap6',
        version: 'v3',
        status: 'active',
        label: '来源低赔泊松 3 格',
        changed: ({ proxyMatches }) => `代理样本 ${proxyMatches} 场：先取外部来源明确比分和 6 倍内低赔共识，再用赛前泊松 EV 补足到 3 格。`,
      },
    ],
  },
];

export function buildKnockoutStrategyEvolutionData({
  results = [],
  strategies = [],
  generatedAt = new Date().toISOString(),
  proxyMatches = 0,
} = {}) {
  const resultById = new Map((results || []).map((result) => [result.strategyId, result]));
  const metadataById = new Map((strategies || []).map((strategy) => [strategy.id, strategy]));

  const families = baseFamilies.map((family) => {
    const baseVersions = family.versions.map((version) => buildVersion({
      definition: version,
      result: resultById.get(version.strategyId),
      proxyMatches,
    }));
    const activeVersion = baseVersions.find((version) => version.status === 'active') || baseVersions.at(-1);
    const includedIds = new Set(family.versions.map((version) => version.strategyId));
    const experiment = findBestExperiment({
      results,
      metadataById,
      familyId: family.experimentFamily,
      includedIds,
      activeVersion,
    });

    const versions = experiment
      ? appendExperimentVersion({ versions: baseVersions, experiment, proxyMatches })
      : baseVersions;
    const promoted = experiment && isPromotion({ experiment, activeVersion });

    return {
      id: family.id,
      name: family.name,
      shortName: family.shortName,
      color: family.color,
      thesis: family.thesis,
      versions: promoted ? demotePreviousActive(versions) : versions,
    };
  });

  return {
    generatedAt,
    proxyMatches,
    families,
  };
}

export function formatKnockoutStrategyEvolutionDataModule(data) {
  return [
    `export const knockoutStrategyEvolutionGeneratedAt = ${JSON.stringify(data.generatedAt)};`,
    `export const knockoutStrategyEvolutionProxyMatches = ${JSON.stringify(data.proxyMatches)};`,
    '',
    `export const knockoutStrategyEvolutionFamilies = ${JSON.stringify(data.families, null, 2)};`,
    '',
  ].join('\n');
}

function buildVersion({ definition, result, proxyMatches }) {
  return {
    version: definition.version,
    status: definition.status,
    label: definition.label,
    changed: definition.changed({ proxyMatches }),
    verdict: buildVerdict({ result, status: definition.status }),
    metrics: normalizeMetrics(result),
  };
}

function appendExperimentVersion({ versions, experiment, proxyMatches }) {
  const status = isPromotion({ experiment, activeVersion: versions.find((version) => version.status === 'active') })
    ? 'active'
    : 'discarded';
  const experimentScore = getResultWeightedTotal(experiment);
  return [
    ...versions,
    {
      version: `v${versions.length}`,
      status,
      label: experiment.strategyName,
      changed: `代理样本 ${proxyMatches} 场：本轮自动实验 ${experiment.strategyId}，平均 ${formatMetric(experiment.averagePicks)} 注，最大命中赔率 ${formatMetric(experiment.maxHitOdds)}。`,
      verdict: status === 'active'
        ? `升级为当前候选：总分 ${formatMetric(experimentScore)}，ROI ${formatSigned(experiment.roiPercent)}%，命中 ${experiment.hitMatches}/${experiment.settledMatches}。`
        : `未升级：总分 ${formatMetric(experimentScore)}，ROI ${formatSigned(experiment.roiPercent)}%，命中 ${experiment.hitMatches}/${experiment.settledMatches}；${getRejectionReason(experiment, versions.find((version) => version.status === 'active'))}`,
      metrics: normalizeMetrics(experiment),
    },
  ];
}

function demotePreviousActive(versions) {
  const activeIndex = versions.findLastIndex((version) => version.status === 'active');
  return versions.map((version, index) => (
    version.status === 'active' && index !== activeIndex
      ? { ...version, status: 'discarded', verdict: `被后续版本替代；${version.verdict}` }
      : version
  ));
}

function findBestExperiment({ results, metadataById, familyId, includedIds, activeVersion }) {
  const candidates = [...(results || [])]
    .filter((result) => !includedIds.has(result.strategyId))
    .filter((result) => metadataById.get(result.strategyId)?.family === familyId)
    .sort((a, b) => getResultWeightedTotal(b) - getResultWeightedTotal(a) || b.roiPercent - a.roiPercent);
  return candidates.find((candidate) => isPromotion({ experiment: candidate, activeVersion }))
    || candidates[0]
    || null;
}

function isPromotion({ experiment, activeVersion }) {
  if (!experiment || !activeVersion) return false;
  const activeScore = getWeightedTotal(activeVersion.metrics);
  return getResultWeightedTotal(experiment) >= activeScore + 1
    && Number(experiment.maxHitOdds || 0) < 60
    && Number(experiment.averagePicks || 0) >= 1.5
    && Number(experiment.averagePicks || 0) <= 4;
}

function getRejectionReason(experiment, activeVersion) {
  if (Number(experiment.maxHitOdds || 0) >= 60) {
    return '主要收益依赖高赔尾部命中，按防彩票化规则保留为失败实验。';
  }
  if (Number(experiment.averagePicks || 0) < 1.5 || Number(experiment.averagePicks || 0) > 4) {
    return '平均下注数不在 1.5-4 的健康区间内，暂不作为旗舰升级。';
  }
  const activeScore = getWeightedTotal(activeVersion?.metrics || {});
  return `没有超过当前候选总分 ${formatMetric(activeScore)} 的升级门槛。`;
}

function getResultWeightedTotal(result) {
  return getWeightedTotal(normalizeMetrics(result));
}

function buildVerdict({ result, status }) {
  if (!result) return '本轮没有足够回测数据，暂不评价。';
  const prefix = status === 'active'
    ? '作为当前候选保留'
    : status === 'discarded'
      ? '保留为失败实验'
      : '作为基线记录';
  return `${prefix}：总分 ${formatMetric(result.knockoutProxyScore)}，ROI ${formatSigned(result.roiPercent)}%，命中 ${result.hitMatches}/${result.settledMatches}。`;
}

function normalizeMetrics(result) {
  return {
    roi: roundMetric(result?.knockoutProxyMetrics?.roi || 0),
    hitRate: roundMetric(result?.knockoutProxyMetrics?.hitRate || 0),
    coverage: roundMetric(result?.knockoutProxyMetrics?.coverage || 0),
    shapeHealth: roundMetric(result?.knockoutProxyMetrics?.shapeHealth || 0),
    explainability: roundMetric(result?.knockoutProxyMetrics?.explainability || 0),
    exploration: roundMetric(result?.knockoutProxyMetrics?.exploration ?? result?.knockoutProxyMetrics?.explainability ?? 0),
  };
}

function getWeightedTotal(metrics) {
  return roundMetric(
    Number(metrics.roi || 0) * 0.35
    + Number(metrics.hitRate || 0) * 0.05
    + Number(metrics.coverage || 0) * 0.15
    + Number(metrics.shapeHealth || 0) * 0.15
    + Number(metrics.explainability || 0) * 0.15
    + Number(metrics.exploration ?? metrics.explainability ?? 0) * 0.15,
  );
}

function roundMetric(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function formatMetric(value) {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}

function formatSigned(value) {
  const formatted = formatMetric(value);
  return Number(value) > 0 ? `+${formatted}` : formatted;
}
