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
- Export text includes a compact `【今日战报】` section before `【预测情况】`, with no blank lines between blocks. Result rows use `张三 ROI 165%｜净收益 +3.3｜命中 1/2｜成本 2`: ROI is `(revenue - cost) / cost`, net profit is `revenue - cost`, cost is one unit per selected score, and the hit denominator is completed matches with any prediction, not selected scores. Include losing players who predicted completed matches, show hit details only for winners as `加拿大 vs 波黑 1-1(8) ✅`, and sort players by ROI, then revenue, then name.
- In the export prediction section, completed match headers should append the final score as `03:00 加拿大 vs 波黑[1-1]`; pre-match or incomplete-score rows should remain unmarked.
- Export footer with a group URL should invite the next available match date after the selected export date, not repeat the selected date: `[欢迎预测] 6月14日比赛 加拿大 vs 波黑、美国 vs 巴拉圭 https://...`. If no later match date exists, keep only `[欢迎预测] https://...`.
- Low-frequency actions live in compact header controls.
- Buttons, score chips, and match rows use stable dimensions; text must not overlap or resize the layout.
- Correct-score chips display odds inline as `1:1(6.5)`, but stored prediction values remain plain scores like `1-1`. The score template should match the Sporttery correct-score market: 28 exact scores plus `胜其他` / `平其他` / `负其他`, each with odds when available.
- Use “比分预测” in user-facing titles and export headers. Avoid “波胆预测” in visible copy.
- Match cards show Chinese team names and the match score/status. Do not show venue text or per-match prediction counts in the card.
- Date tabs include all imported group-stage dates, but the selected today/next match day should auto-scroll to the left edge so future dates are immediately visible.
- The board must remain usable at 390px wide.

## State Rules

- Supabase is the single authority for groups, players, and predictions. Optimistic UI is allowed only if it reconciles back to Supabase.
- Supabase is also the authority for match schedule display. The frontend reads `matches`; it must not hardcode match cards.
- Predictions are keyed by `playerId + matchId`. Re-submitting overwrites that player's prior picks for the match.
- Group isolation is URL-driven: `?group=wx-a` and `?group=wx-b` must not share players or predictions.
- Players live in Supabase under the current group; adding one selects it immediately after the write succeeds.
- Match dates and displayed kickoff times are always UTC+8 (`Asia/Shanghai`). Date tabs and export labels use the UTC+8 match date.
- The match importer upserts by `match_code` and overwrites schedule/status/score fields from the source. Keep legacy compatibility fields (`match_date`, `kickoff_at`, `home_team`, `away_team`) in sync while the old table shape exists.
- Team Chinese names live in the `teams` table as the translation authority. Importers upsert teams from `data/team-name-mapping.csv`, write `home_team_id` and `away_team_id` to matches, and keep `home_cn` / `away_cn` only as snapshots.
- Frontend match loading should use Supabase embedded joins (`home_team:teams!matches_home_team_id_fkey`, `away_team:teams!matches_away_team_id_fkey`) and prefer joined `teams.name_cn` over snapshot fields.

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
- GitHub Actions imports matches hourly at minute 17 UTC and can be manually triggered from `Import World Cup Matches`.
- GitHub Actions requires repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Correct-score odds probe: `npm run probe:odds` fetches 500.com Sporttery score odds, decodes GB18030 HTML, parses to `docs/artifacts/odds-probe/sporttery-score-odds.json`, and does not write Supabase.
- Correct-score odds import: after `sql/stage4_score_odds.sql` is applied, run `npm run import:odds:dry` to validate live parsing, then `npm run import:odds` to upsert `score_odds`. The GitHub Actions workflow `Import Sporttery Odds` runs hourly at minute 43 UTC.
- Backend import reports: after `sql/stage10_import_reports.sql` is applied, match and odds importers write success/failed rows to `import_reports`. The right-header `...` button reads this table as a compact backend report.
- Odds raw audit logs: after `sql/stage12_odds_import_snapshots.sql` is applied, `npm run import:odds` writes one best-effort `odds_import_snapshots` row per fetch with raw GB18030-decoded HTML and parsed JSON. Snapshot failures must warn but not block `score_odds` upsert.
- Render env vars required: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- For iPhone layout QA, prefer Playwright built-in device descriptors (`devices['iPhone SE']`, `devices['iPhone 13']`, `devices['iPhone 14 Pro Max']`) over hand-written viewport guesses.
- Stage 3 real schedule screenshot: `docs/artifacts/stage3/real-schedule-score-iphone13.png`.
- Results export acceptance: `npm run acceptance:results` with a local Vite server verifies an iPhone 13 export dialog using mocked Supabase responses and writes `docs/artifacts/stage9/export-results-*`.
- Backend report acceptance: `npm run acceptance:reports` with a local Vite server verifies the iPhone 13 `...` report dialog with mocked success/failed reports and writes `docs/artifacts/stage10/backend-report-*`.
- Online other-score odds check: `docs/artifacts/online-other-scores/online-other-0616*` verifies the deployed Render page shows `胜其他` / `平其他` / `负其他` on a date with freshly imported odds.

## Current Pitfalls

- The local PATH has `node` but no `npm`, `pnpm`, or `yarn`; use zero-dependency static assets and Node's built-in test runner until a package manager is available.
- Current workspace has npm available at `/opt/homebrew/bin/npm`; use standard Vite + React workflow.
- Use bundled Playwright from Codex runtime when browser automation is needed.
- ESM does not resolve bundled Playwright through `NODE_PATH`; acceptance scripts should use `createRequire()` with the bundled runtime path.
- Full-page mobile screenshots can show fixed bottom bars over later content. Verify the actual viewport path as well as saved screenshots.
- Hand-written `375x667` is not the narrowest iPhone check. Playwright's built-in `iPhone SE` descriptor uses a `320x568` CSS viewport and caught score-chip overflow.
- ESPN's public World Cup scoreboard endpoint can be slow or intermittently time out. Import scripts should use retry with timeout and never make frontend rendering depend on live ESPN fetches.
- 500.com Sporttery pages are GB18030 encoded. Decode with `new TextDecoder('gb18030')`, not UTF-8, or Chinese teams and odds text will be unreliable.
- 500.com date URLs can return overlapping rolling sales windows. Odds importers must dedupe by source match key and then filter by UTC+8 kickoff date before writing/reviewing rows.
- Frontend odds display reads `score_odds` with the browser anon key. If service role sees rows but the page shows fallback scores without odds, check the `score_odds_public_read` RLS select policy.
- Import report writes are best-effort and must not make an otherwise successful import fail. If the report dialog errors while import logs look healthy, first check that `sql/stage10_import_reports.sql` was applied and the public read policy exists.
- Old/incomplete `matches` rows may remain in Supabase from earlier phases. Data loading must filter out rows missing `match_code`, UTC+8 date, kickoff time, home, or away before rendering.
- Shared schedule helpers may receive raw importer rows (`match_date_cn`) or app rows (`date`). Tests should cover both shapes to prevent UI crashes.
