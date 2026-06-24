# Temp Strategy Top 10

第一阶段产物：从大量中间策略中筛出 ROI 达标、样本足够且有解释价值的 10 个候选。

## Dataset

- Generated at: 2026-06-24T15:03:44.214Z
- Context files: 42
- Matched to DB: 42
- Settled completed matches: 42
- Temp candidates: 200
- Qualified temp strategies: 45

## Qualification Gate

- ROI >= 5%
- Settled matches >= 35
- Hit matches >= 4
- Avg picks between 1.5 and 5
- Max picks <= 6

| # | 策略 | 家族 | 风格 | ROI | 成本 | 返还 | 命中 | Avg Picks | 说明 |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 平局锚点 4 格 | draw_anchor | balanced | +53.26% | 132 | 202.3 | 16/42 | 3.14 | 用平局赔率判断比赛是否接近，再围绕 1-1 和低平局展开。 | |
| 2 | 平局锚点 2 格 | draw_anchor | selected | +47.32% | 84 | 123.75 | 10/42 | 2 | 用平局赔率判断比赛是否接近，再围绕 1-1 和低平局展开。 | |
| 3 | 低平局三格 | score_basket | balanced | +44.25% | 126 | 181.75 | 13/42 | 3 | 用固定比分篮子测试低比分、平局和小胜的基础形态。 | |
| 4 | 平局泊松混合 3 格 | hybrid | balanced | +44.25% | 126 | 181.75 | 13/42 | 3 | 把低平局作为结构锚点，再用泊松 EV 寻找非平局补充项。 | |
| 5 | 平局泊松混合 2 格 | hybrid | selected | +37.8% | 84 | 115.75 | 9/42 | 2 | 把低平局作为结构锚点，再用泊松 EV 寻找非平局补充项。 | |
| 6 | 平局锚点 4 格 | draw_anchor | balanced | +41.47% | 143 | 202.3 | 16/42 | 3.4 | 用平局赔率判断比赛是否接近，再围绕 1-1 和低平局展开。 | |
| 7 | 平局泊松混合 2 格 | hybrid | selected | +37.8% | 84 | 115.75 | 9/42 | 2 | 把低平局作为结构锚点，再用泊松 EV 寻找非平局补充项。 | |
| 8 | 平局锚点 4 格 | draw_anchor | balanced | +39.37% | 143 | 199.3 | 15/42 | 3.4 | 用平局赔率判断比赛是否接近，再围绕 1-1 和低平局展开。 | |
| 9 | 平局锚点 4 格 | draw_anchor | balanced | +37.69% | 132 | 181.75 | 13/42 | 3.14 | 用平局赔率判断比赛是否接近，再围绕 1-1 和低平局展开。 | |
| 10 | 平局锚点 4 格 | draw_anchor | balanced | +37.69% | 132 | 181.75 | 13/42 | 3.14 | 用平局赔率判断比赛是否接近，再围绕 1-1 和低平局展开。 | |
