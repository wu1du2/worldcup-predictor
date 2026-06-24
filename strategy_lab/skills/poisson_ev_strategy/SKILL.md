---
name: poisson-ev-strategy
description: Use when building or changing Poisson expected-value correct-score strategies for the World Cup predictor.
---

# Poisson EV Strategy

## Core Rule

Keep probability estimation separate from bet selection. First produce a full Sporttery score probability table, then compute `EV = probability * odds - 1`, then choose the highest-EV scores under the strategy's pick limits.

## Strategy Variants

- `market_poisson_ev`: odds are the probability prior. Fit `lambdaHome`, `lambdaAway`, and Dixon-Coles `rho` from normalized correct-score implied probabilities, then allow small pre-match context adjustments.
- `context_poisson_ev`: context is the probability prior. Estimate expected goals from pre-match context first; odds are used only after the probability table exists.
- `context_poisson_ev_v2`: selected-value variant. Keep context as the probability prior, raise the minimum probability threshold, cap odds more tightly, and select at most two scores. Use this when the goal is sharper picks and lower cost, accepting lower information richness.
- `context_poisson_ev_v3`: balanced-coverage variant. Keep context as the probability prior, apply modest draw/low-score correction, and keep two to four scores. Use this when the goal is richer recommendations and more hit chances, accepting lower or noisier ROI than the most selective variant.

## Guardrails

- Prediction inputs must not include final scores or result fields.
- Sporttery `胜其他` / `平其他` / `负其他` are probability buckets, not individual scores. Sum all out-of-template score probabilities into the matching bucket.
- If every EV is negative, selecting the top EV score is allowed for UI continuity, but the reason should make clear it is the least-bad EV, not a positive edge.
- Backtests settle each selected score as one unit stake unless a later strategy explicitly changes stake sizing.

## Verification

- Unit-test probability mass sums to 1 across the Sporttery template.
- Unit-test EV rows use `probability * odds - 1`.
- Backtest all strategy variants through the same candidate strategy runner as other strategies.
- When iterating variants, report ROI together with cost, return, hit count, and average picks per match. ROI alone can favor over-selective or overfit variants, while average picks captures recommendation richness for the frontend.
