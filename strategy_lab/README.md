# Strategy Lab Directory Contract

This directory is the local working memory for AI score-prediction experiments.

## Structure

```txt
strategy_lab/
  strategies/
    main_strategy.md
    candidates/
  match_info/
    YYYY-MM-DD_HOME_vs_AWAY/
      sources.json
      media.md
      team_news.md
      odds_snapshot.json
      context.json
  predictions/
    strategy_YYYYMMDDTHHmmss_main_strategy_prediction.json
    strategy_YYYYMMDDTHHmmss_main_strategy_report.md
  settlements/
  evaluations/
```

## Rules

- `strategies/main_strategy.md` is the only strategy allowed to produce user-facing predictions.
- Candidate strategies can be tested, but they do not output final recommendations.
- `context.json` is the only authority passed into `predict(strategy, context)`.
- A source can enter `context.json` only when its publication or update time is known and earlier than kickoff in UTC+8.
- Sources with coarse timestamps, post-kickoff updates, or visible final-score contamination stay in `sources.json` and notes, but are excluded from trusted context.
- Every prediction log must include the strategy file, execution time, context file, reason, and `{ score, stake }` list.
