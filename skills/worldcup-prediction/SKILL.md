---
name: worldcup-prediction
description: Use when building or changing the World Cup friend-group score prediction web app, especially mobile UI, prediction collection, export text, persistence, testing, screenshots, or project workflow.
---

# World Cup Prediction Project Skill

## Product North Star

Build a tiny mobile-first tool for a fixed 10-person WeChat group to collect next-day correct-score predictions. Phase 1 is data collection only: no ROI, rankings, odds math, or login.

## Development Flywheel

Before each task, state the goal and acceptance path. Use small changes. For behavior changes, write a failing automated test first, then implement the minimum code, then verify.

After each completed task, update this skill when new project-specific lessons, UI constraints, test paths, or pitfalls appear.

## UI Rules

- Mobile first: the first screen must show the date, player picker, match board, and clear primary action without hunting.
- Main path: choose player -> choose one or more correct scores per match -> submit -> export text.
- The player picker starts with 10 known names but must allow adding a temporary custom name from the same panel.
- Low-frequency actions live in compact header controls.
- Buttons, score chips, and match rows use stable dimensions; text must not overlap or resize the layout.
- Correct-score chips display odds inline as `1:1(6.5)`, but stored prediction values remain plain scores like `1-1`.
- The board must remain usable at 390px wide.

## State Rules

- Phase 1 uses local browser state as a prototype authority.
- Later phases must treat Supabase as the single authority. Optimistic UI is allowed only if it reconciles back to Supabase.
- Predictions are keyed by `playerId + matchId`. Re-submitting overwrites that player's prior picks for the match.
- Custom phase-1 players live in local state under `customPlayers`; adding one selects it immediately.

## Verification SOP

Each phase must produce:

- A reproducible command path.
- Automated tests for core logic.
- Browser acceptance covering the main mobile flow.
- Screenshots for empty board, selected scores, and exported text.
- When player-management changes, capture the add-player dialog screenshot too.
- A saved state JSON and log when meaningful.

Stage 1 artifact directory: `docs/artifacts/stage1/`.

Stage 1 commands:

- Unit logic: `node --test tests/predictionStore.test.mjs`
- Local server: `python3 -m http.server 4173`
- Mobile browser acceptance: `node tests/stage1.acceptance.mjs`

## Current Pitfalls

- The local PATH has `node` but no `npm`, `pnpm`, or `yarn`; use zero-dependency static assets and Node's built-in test runner until a package manager is available.
- Use bundled Playwright from Codex runtime when browser automation is needed.
- ESM does not resolve bundled Playwright through `NODE_PATH`; acceptance scripts should use `createRequire()` with the bundled runtime path.
- Full-page mobile screenshots can show fixed bottom bars over later content. Verify the actual viewport path as well as saved screenshots.
