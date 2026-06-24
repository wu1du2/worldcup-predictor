# Temp Strategy Experiment Notes

## What Ran

Generated 200 temporary strategies across 8 families.
Backtested them on 42 settled matches with pre-match context odds.
Qualified strategies after hard gate: 45.

## Gate

## Qualification Gate

- ROI >= 5%
- Settled matches >= 35
- Hit matches >= 4
- Avg picks between 1.5 and 5
- Max picks <= 6

## Qualified Family Distribution

- hybrid: 21
- draw_anchor: 20
- underdog_protection: 3
- score_basket: 1

## Top10 Observations

- 平局锚点 4 格 (tem_draw_anchor_3_max5_5): ROI +53.26%, hit 16/42, avg picks 3.14. 用平局赔率判断比赛是否接近，再围绕 1-1 和低平局展开。
- 平局锚点 2 格 (tem_draw_anchor_1_max5_5): ROI +47.32%, hit 10/42, avg picks 2. 用平局赔率判断比赛是否接近，再围绕 1-1 和低平局展开。
- 低平局三格 (tem_basket_draw_low3): ROI +44.25%, hit 13/42, avg picks 3. 用固定比分篮子测试低比分、平局和小胜的基础形态。
- 平局泊松混合 3 格 (tem_hybrid_draw_poisson_v2_d3_n3): ROI +44.25%, hit 13/42, avg picks 3. 把低平局作为结构锚点，再用泊松 EV 寻找非平局补充项。
- 平局泊松混合 2 格 (tem_hybrid_draw_poisson_v2_d1_n2): ROI +37.8%, hit 9/42, avg picks 2. 把低平局作为结构锚点，再用泊松 EV 寻找非平局补充项。
- 平局锚点 4 格 (tem_draw_anchor_3_max6_5): ROI +41.47%, hit 16/42, avg picks 3.4. 用平局赔率判断比赛是否接近，再围绕 1-1 和低平局展开。
- 平局泊松混合 2 格 (tem_hybrid_draw_poisson_v3_d1_n2): ROI +37.8%, hit 9/42, avg picks 2. 把低平局作为结构锚点，再用泊松 EV 寻找非平局补充项。
- 平局锚点 4 格 (tem_draw_anchor_4_max6_5): ROI +39.37%, hit 15/42, avg picks 3.4. 用平局赔率判断比赛是否接近，再围绕 1-1 和低平局展开。
- 平局锚点 4 格 (tem_draw_anchor_4_max5_5): ROI +37.69%, hit 13/42, avg picks 3.14. 用平局赔率判断比赛是否接近，再围绕 1-1 和低平局展开。
- 平局锚点 4 格 (tem_draw_anchor_5_max5_5): ROI +37.69%, hit 13/42, avg picks 3.14. 用平局赔率判断比赛是否接近，再围绕 1-1 和低平局展开。

## Production Pool Comparison

- 低比分篮子 (low_score_basket_4): ROI +1.25%, hit 16/42, avg picks 4.
- 平局锚点 (draw_anchor_3): ROI +44.25%, hit 13/42, avg picks 3.
- 赛前泊松EV精选 (context_poisson_ev_v2): ROI +15.06%, hit 4/42, avg picks 1.98.
- 赛前泊松EV均衡 (context_poisson_ev_v3): ROI +8.4%, hit 10/42, avg picks 3.79.

## Final3

- 精选型: 平局泊松混合 2 格 (tem_hybrid_draw_poisson_v2_d1_n2)，ROI +37.8%，下注少、成本低，适合作为高置信推荐入口。
- 均衡型: 平局锚点 4 格 (tem_draw_anchor_3_max5_5)，ROI +53.26%，ROI、命中和可读性较均衡，适合作为默认推荐骨架。
- 进攻型: 赛前泊松EV均衡 (context_poisson_ev_v3)，ROI +8.4%，覆盖更有想象力的赔率区间或分歧场景，接受更高波动。

## Next Iteration

- Use the final3 as research candidates only until user approves router changes.
- If adding them to production, first write router tests that keep the production pool explicit.
- Watch for overfitting: high ROI from one narrow family should not automatically replace diverse candidates.
