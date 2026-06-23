# Strategy Prediction Report

Strategy: `main_strategy`  
Executed at: 2026-06-23 20:45 UTC+8  
Match: 英格兰 vs 克罗地亚  
Context: `../match_info/2026-06-18_英格兰_vs_克罗地亚/context.json`

## Prediction

Reason:

主策略是低比分篮子 v0，本场 context 中 `0-0`、`0-1`、`1-0`、`1-1` 均有可用赔率。赛前媒体、赔率市场和阵容信息共同指向：英格兰是明确热门，但克罗地亚经验强、市场也偏向 under 2.5/谨慎开局。因此这场不触发候选策略的激进改动，保留低比分篮子，输出四个比分各 1 注。

Stake list:

```json
[
  { "score": "0-0", "stake": 1 },
  { "score": "0-1", "stake": 1 },
  { "score": "1-0", "stake": 1 },
  { "score": "1-1", "stake": 1 }
]
```

## Audit

- `context.json` does not contain final score fields.
- Trusted source timestamps are before kickoff.
- Sports Mole was excluded because the current page includes post-match data.
