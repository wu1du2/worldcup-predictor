# Knockout Strategy Platform Review

Updated: 2026-06-28 21:22 UTC+8

## Current Active Flagships

| Family | Strategy | Proxy score | ROI | Hits | Avg picks | Notes |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Stable | `tem_draw_anchor_capped_1_draw5_5_cap35` | 72.4 | +14.37% | 18/56 | 3.1 | Keeps the draw anchor but filters >35x tail scores. |
| Value | `tem_poisson_context_v1_n3_cap35_p0_006` | 74.1 | +20.42% | 11/56 | 2.7 | Uses context Poisson probability plus EV, capped at 35x. |
| Consensus | `tem_consensus_poisson_context_v1_c1_n4_cap7` | 68.2 | +3.54% | 17/56 | 3.7 | Starts from a low-odds consensus anchor and fills with Poisson EV. |

## What Changed This Round

- The temporary search pool now samples by family instead of taking the first N strategies. This prevents late families such as Poisson EV and trend from being hidden by earlier generators.
- Stable upgraded from plain draw anchor to capped draw anchor. The old high-ROI draw variants were rejected when they depended on very high-odds tail hits.
- Consensus upgraded from pure low-odds consensus to consensus plus Poisson EV. It gives a small positive ROI while improving explanation quality.
- Value kept the healthy 3-pick Poisson EV variant. The higher-scoring 1-pick variants remain rejected because average picks below 1.5 are too fragile for a user-facing recommendation.

## Current Platform Cases

- Stable: the best safe challenger is already the active capped draw anchor. Wider draw thresholds add hits but lower ROI or shape score.
- Value: one-pick Poisson variants score slightly higher, but they are rejected as unhealthy single-point strategies. Among 2-4 pick variants, the active 3-pick cap-35 set is still best.
- Consensus: cap-8/cap-10 variants tie the active shape but do not improve score. Pure low-odds consensus hits more often but stays less explainable and less profitable.

## Next Search Hypotheses

- Stable: try draw-anchor variants that adapt the fourth score by favorite direction while still capping all odds.
- Value: add calibrated 2-3 pick Poisson variants with explicit diversity constraints so picks are not all adjacent low draws.
- Consensus: combine external-source score picks with Poisson EV fills, not only low-odds market consensus.
