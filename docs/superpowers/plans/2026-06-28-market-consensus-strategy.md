# Market Consensus Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a market-consensus AI strategy that combines correct-score odds with external source predictions, then route knockout matches toward it when source consensus is strong.

**Architecture:** Keep the logic local and deterministic. `src/sourceConsensusStrategy.mjs` will score score options from `match.strategyContext.externalPredictions`; `src/strategyCandidates.mjs` exposes it as a candidate; `src/strategyRouter.mjs` gives it a knockout/source-fit feature score and explanation. Existing prediction sync and Supabase surfaces stay unchanged.

**Tech Stack:** Node ESM, built-in `node:test`, existing strategy/router modules, Supabase scripts already in the repo.

---

### Task 1: Source Consensus Scoring

**Files:**
- Create: `src/sourceConsensusStrategy.mjs`
- Test: `tests/sourceConsensusStrategy.test.mjs`

- [x] Write failing tests for explicit score predictions, direction predictions, and odds fallback.
- [x] Run `npm test -- tests/sourceConsensusStrategy.test.mjs` and verify failure.
- [x] Implement deterministic scoring and explanations.
- [x] Run the test and verify pass.

### Task 2: Strategy + Router Integration

**Files:**
- Modify: `src/strategyCandidates.mjs`
- Modify: `src/strategyRouter.mjs`
- Test: `tests/strategyRouter.test.mjs`

- [x] Write failing tests that source consensus picks `2-1/3-1/1-0` for Brazil-Japan-style context and that router chooses it in knockout when sources agree.
- [x] Run tests and verify failure.
- [x] Add `market_consensus_sources` candidate and source-fit router scoring.
- [x] Run tests and verify pass.

### Task 3: Current Match Trial

**Files:**
- Modify local context JSON files only for current active knockout matches with known sources.

- [x] Add minimal `externalPredictions` context for Brazil vs Japan from browsed sources.
- [x] Run `npm run ai:predict-router:dry -- --from=2026-06-29` and compare old/new output.
- [x] If output is reasonable, run `npm run ai:predict-router -- --from=2026-06-29`.
- [x] Run `npm test` and `npm run build` before final report.
