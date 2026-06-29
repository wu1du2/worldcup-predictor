export const knockoutStrategyEvolutionGeneratedAt = "2026-06-29T12:29:55.160Z";
export const knockoutStrategyEvolutionProxyMatches = 57;

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
        "changed": "代理样本 57 场：固定覆盖 0-0、0-1、1-0、1-1。",
        "verdict": "作为基线记录：总分 67.8，ROI -13.4%，命中 22/57。",
        "metrics": {
          "roi": 46.6,
          "hitRate": 100,
          "coverage": 100,
          "shapeHealth": 70,
          "explainability": 70,
          "exploration": 70
        }
      },
      {
        "version": "v1",
        "status": "discarded",
        "label": "平局锚点 4 格",
        "changed": "代理样本 57 场：平局低位时覆盖 1-1、2-2、0-0、1-0，否则回落到三格。",
        "verdict": "保留为失败实验：总分 81.2，ROI +8.15%，命中 18/57。",
        "metrics": {
          "roi": 68.2,
          "hitRate": 100,
          "coverage": 100,
          "shapeHealth": 86,
          "explainability": 78,
          "exploration": 85
        }
      },
      {
        "version": "v2",
        "status": "discarded",
        "label": "热门平局保护",
        "changed": "代理样本 57 场：热门小胜为主，同时保留 1-1。",
        "verdict": "保留为失败实验：总分 57.5，ROI -46.32%，命中 20/57。",
        "metrics": {
          "roi": 13.7,
          "hitRate": 100,
          "coverage": 100,
          "shapeHealth": 70,
          "explainability": 78,
          "exploration": 70
        }
      },
      {
        "version": "v3",
        "status": "active",
        "label": "平局锚点省注",
        "changed": "代理样本 57 场：固定保留 1-1/0-0；平局低于 6 时加入两个最低赔非平局保护，并过滤 22 倍以上长尾。",
        "verdict": "作为当前候选保留：总分 88.7，ROI +17.84%，命中 19/56。",
        "metrics": {
          "roi": 77.8,
          "hitRate": 100,
          "coverage": 98.2,
          "shapeHealth": 100,
          "explainability": 78,
          "exploration": 100
        }
      },
      {
        "version": "v4",
        "status": "discarded",
        "label": "平局锚点省注",
        "changed": "代理样本 57 场：本轮自动实验 tem_draw_anchor_lean_homeaway2_draw5_5_cap22，平均 2.3 注，最大命中赔率 22。",
        "verdict": "未升级：总分 88，ROI +17.71%，命中 17/56；没有超过当前候选总分 88.7 的升级门槛。",
        "metrics": {
          "roi": 77.7,
          "hitRate": 100,
          "coverage": 98.2,
          "shapeHealth": 96,
          "explainability": 78,
          "exploration": 100
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
        "changed": "代理样本 57 场：用赛前 context 估计期望进球，再按 EV 排序。",
        "verdict": "作为基线记录：总分 69.7，ROI -22.97%，命中 9/57。",
        "metrics": {
          "roi": 37,
          "hitRate": 100,
          "coverage": 100,
          "shapeHealth": 76,
          "explainability": 84,
          "exploration": 85
        }
      },
      {
        "version": "v1",
        "status": "discarded",
        "label": "赛前泊松EV精选",
        "changed": "代理样本 57 场：提高概率门槛并限制最多 2 个比分。",
        "verdict": "保留为失败实验：总分 80.4，ROI -4.09%，命中 6/57。",
        "metrics": {
          "roi": 55.9,
          "hitRate": 100,
          "coverage": 100,
          "shapeHealth": 88,
          "explainability": 84,
          "exploration": 100
        }
      },
      {
        "version": "v2",
        "status": "discarded",
        "label": "市场泊松高波动",
        "changed": "代理样本 57 场：用比分赔率反推市场进球分布再寻找高 EV。",
        "verdict": "保留为失败实验：总分 58.2，ROI -43.23%，命中 2/57。",
        "metrics": {
          "roi": 16.8,
          "hitRate": 43.9,
          "coverage": 100,
          "shapeHealth": 65,
          "explainability": 84,
          "exploration": 85
        }
      },
      {
        "version": "v3",
        "status": "active",
        "label": "赛前泊松EV平局保护",
        "changed": "代理样本 57 场：先取两个赛前泊松多样性 EV 候选；若 1-1 不高于 7.5 倍，则加入平局保护。",
        "verdict": "作为当前候选保留：总分 91.8，ROI +23.45%，命中 14/57。",
        "metrics": {
          "roi": 83.5,
          "hitRate": 100,
          "coverage": 100,
          "shapeHealth": 100,
          "explainability": 84,
          "exploration": 100
        }
      },
      {
        "version": "v4",
        "status": "discarded",
        "label": "赛前泊松EV基础 1 格",
        "changed": "代理样本 57 场：本轮自动实验 tem_poisson_context_v1_n1_cap35_p0_006，平均 1 注，最大命中赔率 28。",
        "verdict": "未升级：总分 92.5，ROI +40.35%，命中 4/57；平均下注数不在 1.5-4 的健康区间内，暂不作为旗舰升级。",
        "metrics": {
          "roi": 100,
          "hitRate": 87.7,
          "coverage": 100,
          "shapeHealth": 70,
          "explainability": 84,
          "exploration": 100
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
        "changed": "代理样本 57 场：直接购买市场最低赔率的三个比分。",
        "verdict": "作为基线记录：总分 68.8，ROI -19.01%，命中 23/57。",
        "metrics": {
          "roi": 41,
          "hitRate": 100,
          "coverage": 100,
          "shapeHealth": 90,
          "explainability": 70,
          "exploration": 70
        }
      },
      {
        "version": "v1",
        "status": "discarded",
        "label": "来源不足补位",
        "changed": "代理样本 57 场：综合机构明确比分、方向型预测和赔率低位。",
        "verdict": "保留为失败实验：总分 76.3，ROI -19.01%，命中 23/57。",
        "metrics": {
          "roi": 41,
          "hitRate": 100,
          "coverage": 100,
          "shapeHealth": 90,
          "explainability": 90,
          "exploration": 100
        }
      },
      {
        "version": "v2",
        "status": "discarded",
        "label": "四格共识扩展",
        "changed": "代理样本 57 场：最低赔率四项，覆盖更宽。",
        "verdict": "保留为失败实验：总分 67.5，ROI -29.32%，命中 26/57。",
        "metrics": {
          "roi": 30.7,
          "hitRate": 100,
          "coverage": 100,
          "shapeHealth": 70,
          "explainability": 90,
          "exploration": 85
        }
      },
      {
        "version": "v3",
        "status": "active",
        "label": "来源低赔泊松 3 格",
        "changed": "代理样本 57 场：先取外部来源明确比分和 6 倍内低赔共识，再用赛前泊松 EV 补足到 3 格。",
        "verdict": "作为当前候选保留：总分 84.6，ROI +4.5%，命中 21/57。",
        "metrics": {
          "roi": 64.5,
          "hitRate": 100,
          "coverage": 100,
          "shapeHealth": 90,
          "explainability": 90,
          "exploration": 100
        }
      },
      {
        "version": "v4",
        "status": "discarded",
        "label": "来源低赔泊松 3 格",
        "changed": "代理样本 57 场：本轮自动实验 tem_source_consensus_poisson_context_v3_s2_c3_n3_cap6，平均 3 注，最大命中赔率 28。",
        "verdict": "未升级：总分 84.6，ROI +4.5%，命中 21/57；没有超过当前候选总分 84.6 的升级门槛。",
        "metrics": {
          "roi": 64.5,
          "hitRate": 100,
          "coverage": 100,
          "shapeHealth": 90,
          "explainability": 90,
          "exploration": 100
        }
      }
    ]
  }
];
