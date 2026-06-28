# Knockout Strategy Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-first `淘汰赛策略` view that shows all versions, including failed experiments, for the three knockout flagship strategy families.

**Architecture:** Keep the first version frontend-only with a deterministic data module and SVG charts. The UI lives behind the existing `...` menu and can later swap the data source to Supabase or generated strategy-lab JSON without changing the dialog structure.

**Tech Stack:** React, CSS, Node built-in tests, Vite, Playwright iPhone 13 acceptance.

---

### Task 1: Evolution Data Contract

**Files:**
- Create: `src/knockoutStrategyEvolution.mjs`
- Test: `tests/knockoutStrategyEvolution.test.mjs`

- [x] Write tests proving three families exist, failed versions are retained, and total scores use the weighted scoring contract.
- [x] Run `npm test -- tests/knockoutStrategyEvolution.test.mjs` and verify the test fails because the module is missing.
- [x] Implement the first proxy-scored `stable/value/consensus` version history and chart helpers.
- [x] Run the test again and verify it passes.

### Task 2: Mobile Dialog and Charts

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/styles.css`
- Test: `tests/knockoutStrategyUiStructure.test.mjs`

- [x] Write structure tests proving the `更多` menu has `淘汰赛策略`, the dialog renders the total chart and metric chart tabs, and discarded versions remain visible.
- [x] Run the structure test and verify failure.
- [x] Implement the dialog, SVG line chart, family cards, metric tabs, and compact version list.
- [x] Run the structure test and verify pass.

### Task 3: Verification and Publish

**Files:**
- Update: `skills/worldcup-prediction/SKILL.md`

- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run an iPhone 13 Playwright acceptance path opening `... -> 淘汰赛策略` and save a screenshot.
- [x] Update the project skill with the visualization contract.
- [ ] Commit and push only intended files.
