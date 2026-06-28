export const knockoutStrategyEvolutionGeneratedAt = "2026-06-28T14:27:06.289Z";
export const knockoutStrategyEvolutionProxyMatches = 56;

export const knockoutStrategyEvolutionFamilies = [
  {
    "id": "knockout_stable",
    "name": "稳定型",
    "shortName": "稳定",
    "color": "#126252",
    "thesis": "低比分、强队小胜、平局保护，目标是减少离谱亏损。",
    "versions": [
      {
        "version": "v0",
        "status": "baseline",
        "label": "低比分篮子",
        "changed": "代理样本 56 场：固定覆盖 0-0、0-1、1-0、1-1。",
        "verdict": "作为基线记录：总分 59.4，ROI -14.49%，命中 21/56。",
        "metrics": {
          "roi": 45.5,
          "hitRate": 37.5,
          "coverage": 100,
          "shapeHealth": 70,
          "explainability": 70
        }
      },
      {
        "version": "v1",
        "status": "discarded",
        "label": "平局锚点 4 格",
        "changed": "代理样本 56 场：平局低位时覆盖 1-1、2-2、0-0、1-0，否则回落到三格。",
        "verdict": "被后续版本替代；作为当前候选保留：总分 70.5，ROI +9.94%，命中 18/56。",
        "metrics": {
          "roi": 69.9,
          "hitRate": 32.1,
          "coverage": 100,
          "shapeHealth": 86,
          "explainability": 78
        }
      },
      {
        "version": "v2",
        "status": "discarded",
        "label": "热门平局保护",
        "changed": "代理样本 56 场：热门小胜为主，同时保留 1-1。",
        "verdict": "保留为失败实验：总分 48.2，ROI -47.99%，命中 19/56。",
        "metrics": {
          "roi": 12,
          "hitRate": 33.9,
          "coverage": 100,
          "shapeHealth": 70,
          "explainability": 78
        }
      },
      {
        "version": "v3",
        "status": "active",
        "label": "平局锚点限赔 4 格",
        "changed": "代理样本 56 场：本轮自动实验 tem_draw_anchor_capped_1_draw5_5_cap35，平均 3.1 注，最大命中赔率 28。",
        "verdict": "升级为当前候选：总分 72.4，ROI +14.37%，命中 18/56。",
        "metrics": {
          "roi": 74.4,
          "hitRate": 32.1,
          "coverage": 100,
          "shapeHealth": 88,
          "explainability": 78
        }
      }
    ]
  },
  {
    "id": "knockout_value",
    "name": "价值型",
    "shortName": "价值",
    "color": "#1f5edc",
    "thesis": "用模型概率乘赔率找被低估比分，允许适度冒险。",
    "versions": [
      {
        "version": "v0",
        "status": "baseline",
        "label": "赛前泊松EV基础",
        "changed": "代理样本 56 场：用赛前 context 估计期望进球，再按 EV 排序。",
        "verdict": "作为基线记录：总分 55.6，ROI -21.84%，命中 9/56。",
        "metrics": {
          "roi": 38.2,
          "hitRate": 16.1,
          "coverage": 100,
          "shapeHealth": 76,
          "explainability": 84
        }
      },
      {
        "version": "v1",
        "status": "discarded",
        "label": "赛前泊松EV精选",
        "changed": "代理样本 56 场：提高概率门槛并限制最多 2 个比分。",
        "verdict": "被后续版本替代；作为当前候选保留：总分 63.1，ROI -2.31%，命中 6/56。",
        "metrics": {
          "roi": 57.7,
          "hitRate": 10.7,
          "coverage": 100,
          "shapeHealth": 88,
          "explainability": 84
        }
      },
      {
        "version": "v2",
        "status": "discarded",
        "label": "市场泊松高波动",
        "changed": "代理样本 56 场：用比分赔率反推市场进球分布再寻找高 EV。",
        "verdict": "保留为失败实验：总分 44.5，ROI -41.72%，命中 2/56。",
        "metrics": {
          "roi": 18.3,
          "hitRate": 3.6,
          "coverage": 100,
          "shapeHealth": 65,
          "explainability": 84
        }
      },
      {
        "version": "v3",
        "status": "active",
        "label": "赛前泊松EV平局保护",
        "changed": "代理样本 56 场：本轮自动实验 tem_poisson_drawguard_context_v3_n2_draw7_5_cap35_p0_006，平均 2.5 注，最大命中赔率 28。",
        "verdict": "升级为当前候选：总分 77.7，ROI +26.06%，命中 14/56。",
        "metrics": {
          "roi": 86.1,
          "hitRate": 25,
          "coverage": 100,
          "shapeHealth": 100,
          "explainability": 84
        }
      }
    ]
  },
  {
    "id": "knockout_consensus",
    "name": "共识型",
    "shortName": "共识",
    "color": "#9b4d16",
    "thesis": "综合机构明确比分、市场方向和赔率低位，目标是人类读得懂。",
    "versions": [
      {
        "version": "v0",
        "status": "baseline",
        "label": "最低赔率三项",
        "changed": "代理样本 56 场：直接购买市场最低赔率的三个比分。",
        "verdict": "作为基线记录：总分 60.5，ROI -21.07%，命中 22/56。",
        "metrics": {
          "roi": 38.9,
          "hitRate": 39.3,
          "coverage": 100,
          "shapeHealth": 90,
          "explainability": 70
        }
      },
      {
        "version": "v1",
        "status": "discarded",
        "label": "来源不足补位",
        "changed": "代理样本 56 场：综合机构明确比分、方向型预测和赔率低位。",
        "verdict": "被后续版本替代；作为当前候选保留：总分 63.5，ROI -21.07%，命中 22/56。",
        "metrics": {
          "roi": 38.9,
          "hitRate": 39.3,
          "coverage": 100,
          "shapeHealth": 90,
          "explainability": 90
        }
      },
      {
        "version": "v2",
        "status": "discarded",
        "label": "四格共识扩展",
        "changed": "代理样本 56 场：最低赔率四项，覆盖更宽。",
        "verdict": "保留为失败实验：总分 58.2，ROI -30.69%，命中 25/56。",
        "metrics": {
          "roi": 29.3,
          "hitRate": 44.6,
          "coverage": 100,
          "shapeHealth": 70,
          "explainability": 90
        }
      },
      {
        "version": "v3",
        "status": "active",
        "label": "共识泊松 4 格",
        "changed": "代理样本 56 场：本轮自动实验 tem_consensus_poisson_context_v1_c1_n4_cap7，平均 3.7 注，最大命中赔率 28。",
        "verdict": "升级为当前候选：总分 68.2，ROI +3.54%，命中 17/56。",
        "metrics": {
          "roi": 63.5,
          "hitRate": 30.4,
          "coverage": 100,
          "shapeHealth": 76,
          "explainability": 90
        }
      }
    ]
  }
];
