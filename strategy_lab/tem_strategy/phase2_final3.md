# Phase 2 Final 3

第二阶段产物：从第一阶段 Top10 和当前生产 router 四策略中，选出三个风格互补的候选。

## Dataset

- Generated at: 2026-06-24T15:03:44.214Z
- Context files: 42
- Matched to DB: 42
- Settled completed matches: 42
- Temp candidates: 200
- Qualified temp strategies: 45

## Source Pool

- Temp top10: 10
- Production router candidates: low_score_basket_4, draw_anchor_3, context_poisson_ev_v2, context_poisson_ev_v3

| Profile | 策略 | 来源 | ROI | 成本 | 返还 | 命中 | Avg Picks | 为什么留下 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 精选型 | 平局泊松混合 2 格 | tem_strategy_top10 | +37.8% | 84 | 115.75 | 9/42 | 2 | 下注少、成本低，适合作为高置信推荐入口。 把低平局作为结构锚点，再用泊松 EV 寻找非平局补充项。 | |
| 均衡型 | 平局锚点 4 格 | tem_strategy_top10 | +53.26% | 132 | 202.3 | 16/42 | 3.14 | ROI、命中和可读性较均衡，适合作为默认推荐骨架。 用平局赔率判断比赛是否接近，再围绕 1-1 和低平局展开。 | |
| 进攻型 | 赛前泊松EV均衡 | production_router_pool | +8.4% | 159 | 172.35 | 10/42 | 3.79 | 覆盖更有想象力的赔率区间或分歧场景，接受更高波动。 赛前泊松EV的均衡覆盖版本，加入平局和低比分修正，保留更多候选以提高信息量。 | |
