# Strategy Lab V0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, auditable strategy experiment pipeline where a strategy string plus pre-match context produces reasons and stake lists, then a separate verifier settles ROI.

**Architecture:** Keep prediction and settlement separated so historical backtests and future live runs use the same `predict(strategy, context)` interface. Write local artifacts for strategy text, contexts, prediction logs, settlement, verification summary, and readable report.

**Tech Stack:** Node ESM, Node built-in test runner, existing Supabase loader helpers and score/odds data model.

---

### Task 1: Strategy Core

**Files:**
- Create: `src/strategyLab.mjs`
- Create: `tests/strategyLab.test.mjs`

- [ ] Write failing tests for context shape, strategy-string prediction, and settlement.
- [ ] Implement minimal deterministic strategy parser for score labels and per-score stake.
- [ ] Keep result fields out of `context` and only use results inside settlement.
- [ ] Run `node --test tests/strategyLab.test.mjs`.

### Task 2: Local Runner

**Files:**
- Create: `scripts/runStrategyLab.mjs`
- Modify: `package.json`

- [ ] Write a runner that loads Supabase matches, odds, and trends.
- [ ] Build pre-match contexts and predictions for every match with odds.
- [ ] Settle only completed matches in a separate verifier step.
- [ ] Write artifacts under `docs/artifacts/strategy-lab/<run-id>/`.
- [ ] Add `strategy:lab` npm script.

### Task 3: Verification

**Files:**
- Modify: `tests/strategyLab.test.mjs`

- [ ] Test verifier rejects leaked result fields in context.
- [ ] Test ROI calculation and per-match prediction logs.
- [ ] Run `npm test` and `npm run strategy:lab`.

### Self-review

- No strategy sees final scores in context.
- `predict(strategy, context)` returns `{ reason, stakes }`.
- Artifacts make every step inspectable.
