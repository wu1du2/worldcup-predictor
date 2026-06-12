---
name: worldcup-prediction
description: Use when building or changing the World Cup friend-group score prediction web app, especially mobile UI, prediction collection, export text, persistence, testing, screenshots, or project workflow.
---

# World Cup Prediction Project Skill

## Product North Star

Build a tiny mobile-first tool for WeChat groups to collect next-day correct-score predictions. Phase 2 is data collection with Supabase persistence and `?group=` URL isolation: no ROI, rankings, odds math, or login.

## Development Flywheel

Before each task, state the goal and acceptance path. Use small changes. For behavior changes, write a failing automated test first, then implement the minimum code, then verify.

After each completed task, update this skill when new project-specific lessons, UI constraints, test paths, or pitfalls appear.

## UI Rules

- Mobile first: the first screen must show the date, player picker, match board, and clear primary action without hunting.
- Main path: choose player -> choose one or more correct scores per match -> submit -> export text.
- New groups start with no members. The player picker shows only group-specific Supabase players plus a `+` button.
- Export dialog must support one-tap clipboard copy and show an immediate copied/failed state.
- Low-frequency actions live in compact header controls.
- Buttons, score chips, and match rows use stable dimensions; text must not overlap or resize the layout.
- Correct-score chips display odds inline as `1:1(6.5)`, but stored prediction values remain plain scores like `1-1`.
- The board must remain usable at 390px wide.

## State Rules

- Supabase is the single authority for groups, players, and predictions. Optimistic UI is allowed only if it reconciles back to Supabase.
- Supabase is also the authority for match schedule display. The frontend reads `matches`; it must not hardcode match cards.
- Predictions are keyed by `playerId + matchId`. Re-submitting overwrites that player's prior picks for the match.
- Group isolation is URL-driven: `?group=wx-a` and `?group=wx-b` must not share players or predictions.
- Players live in Supabase under the current group; adding one selects it immediately after the write succeeds.
- Match dates and displayed kickoff times are always UTC+8 (`Asia/Shanghai`). Date tabs and export labels use the UTC+8 match date.
- The match importer upserts by `match_code` and overwrites schedule/status/score fields from the source. Keep legacy compatibility fields (`match_date`, `kickoff_at`, `home_team`, `away_team`) in sync while the old table shape exists.

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

- Install deps: `npm install`
- Unit and config tests: `npm test`
- Production build: `npm run build`
- Local server: `npm run dev`
- Mobile browser acceptance: `npm run acceptance`
- Render Static Site: build command `npm run build`, publish directory `dist`.
- Supabase two-group acceptance: `npm run acceptance:supabase`.
- Match import dry run: `npm run import:matches:dry`.
- Match import write: `npm run import:matches`.
- Render env vars required: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- For iPhone layout QA, prefer Playwright built-in device descriptors (`devices['iPhone SE']`, `devices['iPhone 13']`, `devices['iPhone 14 Pro Max']`) over hand-written viewport guesses.
- Stage 3 real schedule screenshot: `docs/artifacts/stage3/real-schedule-score-iphone13.png`.

## Current Pitfalls

- The local PATH has `node` but no `npm`, `pnpm`, or `yarn`; use zero-dependency static assets and Node's built-in test runner until a package manager is available.
- Current workspace has npm available at `/opt/homebrew/bin/npm`; use standard Vite + React workflow.
- Use bundled Playwright from Codex runtime when browser automation is needed.
- ESM does not resolve bundled Playwright through `NODE_PATH`; acceptance scripts should use `createRequire()` with the bundled runtime path.
- Full-page mobile screenshots can show fixed bottom bars over later content. Verify the actual viewport path as well as saved screenshots.
- Hand-written `375x667` is not the narrowest iPhone check. Playwright's built-in `iPhone SE` descriptor uses a `320x568` CSS viewport and caught score-chip overflow.
- ESPN's public World Cup scoreboard endpoint can be slow or intermittently time out. Import scripts should use retry with timeout and never make frontend rendering depend on live ESPN fetches.
- Old/incomplete `matches` rows may remain in Supabase from earlier phases. Data loading must filter out rows missing `match_code`, UTC+8 date, kickoff time, home, or away before rendering.
- Shared schedule helpers may receive raw importer rows (`match_date_cn`) or app rows (`date`). Tests should cover both shapes to prevent UI crashes.
