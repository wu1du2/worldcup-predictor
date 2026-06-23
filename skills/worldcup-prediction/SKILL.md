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
- Visiting the app without a `group` query parameter shows a one-button homepage. `创建群链接` generates a six-character lowercase alphanumeric group code, navigates to `?group=<code>`, and shows a one-time hint telling the user to use `导出文本` to save/share the group URL. Do not validate non-empty `group` values on the client.
- New groups start with no members. The player picker shows only group-specific Supabase players plus a `+` button.
- Export dialog must support one-tap clipboard copy and show an immediate copied/failed state.
- Export text includes a compact `【今日战报】` section before `【预测情况】`, with player blocks formatted as `🎯[称号] 张三｜165%` then `净收益 +3.3｜命中 1/2｜成本 2`; hit details are indented as `  ✅ 加拿大 vs 波黑 1-1(8)`. ROI is `(revenue - cost) / cost`, net profit is `revenue - cost`, cost is one unit per selected score, and the hit denominator is completed matches with any prediction, not selected scores. Include losing players who predicted completed matches, and sort players by ROI, then revenue, then name.
- Daily battle report rows prefix each player with a stable ROI emoji and title. Both are chosen from the same ROI band but with separate seeds (`...|emoji` and `...|title`) so repeated exports for the same day do not change but emoji/title are not one-to-one bound. Title bands: `>=200` 赔率刺客/庄家噩梦/剧本阅读者/赛果穿越者/大场面先生; `100..199` 懂球帝/赛果预言家/比分猎手/神来一笔/红单体质/灵感在线; `30..99` 稳健大师/小赚怡情/准星在线/有点东西; `0..29` 保本战士/略懂皮毛/谨慎派/不亏就赢; `-30..-1` 手感微凉/惜败选手/差口气/险些上岸/差点回本/今晚不服; `-80..-31` 快乐赞助商/赛前很美/玄学波动/已经上头/心态微崩; `<-80` 倒霉蛋/天台观察员/庄家好友/玄学受害者. Emoji bands: `>=200` 🚀/🔥/👑; `100..199` 🎯/📈/🏹; `30..99` 🟢/✨/💪; `0..29` ➕/🟡/🛟; `-30..-1` 😬/🥲/😮‍💨/🛟/🤏/😤; `-80..-31` 💸/🌧️/🧨/🤯/📉/😵‍💫; `<-80` ❌/🧊/🫠/💀/😵‍💫/🧨.
- The `...` header menu contains low-frequency tools: `总榜统计` and `后台报告`. `总榜统计` always aggregates only the current URL group by using currently loaded group players/predictions with all completed matches and the same ROI/cost/revenue rules as daily exports.
- In the export prediction section, completed match headers should append the final score as `03:00 加拿大 vs 波黑[1-1]`; pre-match or incomplete-score rows should remain unmarked.
- Export footer with a group URL should invite the next available match date after the selected export date, not repeat the selected date: `[欢迎预测] 6月14日比赛 加拿大 vs 波黑、美国 vs 巴拉圭 https://...`. If no later match date exists, keep only `[欢迎预测] https://...`.
- Low-frequency actions live in compact header controls.
- Buttons, score chips, and match rows use stable dimensions; text must not overlap or resize the layout.
- Correct-score chips display odds inline as `1:1(6.5)`, but stored prediction values remain plain scores like `1-1`. The score template should match the Sporttery correct-score market: 28 exact scores plus `胜其他` / `平其他` / `负其他`, each with odds when available.
- Completed match score chips should highlight the winning option with a non-green amber/gold border only, so it remains visually distinct from the user's green selected state. Exact scores compare directly; `胜其他` / `平其他` / `负其他` are correct only when the final score is outside the fixed Sporttery exact-score template and has the matching result direction.
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

## Future Ideas

- Strategy Lab / AI Player: build an offline strategy-test architecture that freezes pre-match context snapshots before kickoff, prevents result leakage, supports pure strategy functions like `strategy(matchContext) => picks`, and later lets an AI player collect public pre-match data, produce daily predictions, and settle ROI alongside human players.

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
- GitHub scheduled workflows are not reliable enough for near-live updates. For 5-minute refresh, use cron-job.org to call GitHub `workflow_dispatch` for `import-matches.yml` and `import-odds.yml`; keep the hourly GitHub schedules as a fallback. Import workflows use `concurrency` groups so external triggers do not pile up overlapping runs.
- Correct-score odds probe: `npm run probe:odds` fetches 500.com Sporttery score odds, decodes GB18030 HTML, parses to `docs/artifacts/odds-probe/sporttery-score-odds.json`, and does not write Supabase.
- Correct-score odds import: after `sql/stage4_score_odds.sql` is applied, run `npm run import:odds:dry` to validate live parsing, then `npm run import:odds` to upsert `score_odds`. The GitHub Actions workflow `Import Sporttery Odds` runs hourly at minute 43 UTC.
- Backend import reports: after `sql/stage10_import_reports.sql` is applied, match and odds importers write success/failed rows to `import_reports`. The right-header `...` button reads this table as a compact backend report.
- Odds raw audit logs: after `sql/stage12_odds_import_snapshots.sql` is applied, `npm run import:odds` writes one best-effort `odds_import_snapshots` row per fetch with raw GB18030-decoded HTML and parsed JSON. Snapshot failures must warn but not block `score_odds` upsert.
- Odds trends: after `sql/stage13_score_odds_trends.sql` is applied, `npm run backfill:odds-trends` scans all `odds_import_snapshots` matches and writes first-to-latest rows to `score_odds_trends`; pass `--issue=... --kickoff=... --home=... --away=...` only for a single-match repair. Verified full backfill on 2026-06-22 wrote 1302 rows for 42 matches. Snapshot reads must page by `source_date` to use `odds_import_snapshots_source_date_created_idx`; global `order(created_at)` can hit Supabase statement timeout.
- Odds trend UI: score chips with trend data render the normal odds label on the first line and first-to-latest change on the second line. Green means odds rose, red means odds fell. Local iPhone 13 acceptance for England vs Croatia writes `docs/artifacts/online-observe/local-0618-england-croatia-trends.png`; expected examples include `1:0(6.3) +14.5%`, `2:1(5.6) -20%`, and `4:2(60) -20%`.
- Render env vars required: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- For iPhone layout QA, prefer Playwright built-in device descriptors (`devices['iPhone SE']`, `devices['iPhone 13']`, `devices['iPhone 14 Pro Max']`) over hand-written viewport guesses.
- Stage 3 real schedule screenshot: `docs/artifacts/stage3/real-schedule-score-iphone13.png`.
- Results export acceptance: `npm run acceptance:results` with a local Vite server verifies an iPhone 13 export dialog using mocked Supabase responses and writes `docs/artifacts/stage9/export-results-*`.
- Backend report acceptance: `npm run acceptance:reports` with a local Vite server verifies the iPhone 13 `...` report dialog with mocked success/failed reports and writes `docs/artifacts/stage10/backend-report-*`.
- Total stats acceptance: `npm run acceptance:stats` with a local Vite server verifies the iPhone 13 `...` -> `总榜统计` flow with mocked current-group data and writes `docs/artifacts/stage11/total-stats-*`.
- Homepage create-group acceptance: `npm run acceptance:home` with a local Vite server verifies the no-group homepage, generated group navigation, and one-time share hint, writing `docs/artifacts/stage12/*`.
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
- 500.com score pages can repeat the same score odds inside one parsed match block. Deduplicate score rows by `source + source_match_key + score` before validation/upsert, and keep parsed snapshots deduped so audit logs stay readable.
- Do not parse 500.com odds by stripping all tags and using the next `世界杯` text as the match boundary. The page can interleave non-World-Cup lottery matches between World Cup rows, which will contaminate the previous World Cup match. Parse each `tr.bet-tb-tr` segment structurally from `data-*` attributes plus its adjacent `bet-more-wrap`.
- Sporttery Chinese names can differ from schedule names, e.g. `刚果(金)` vs `刚果民主共和国`, `乌兹别克` vs `乌兹别克斯坦`. Normalize these aliases through the shared `normalizeSportteryTeamName` helper in both odds import and odds trend backfill; frontend odds matching should only join on internal standard Chinese names.
- Frontend odds display reads `score_odds` with the browser anon key. If service role sees rows but the page shows fallback scores without odds, check the `score_odds_public_read` RLS select policy.
- Supabase browser selects can silently cap large tables at 1000 rows. `score_odds` already exceeds this; frontend odds loading must paginate with `.range(...)` or later dates will fall back to no-odds score chips even though rows exist.
- Import report writes are best-effort and must not make an otherwise successful import fail. If the report dialog errors while import logs look healthy, first check that `sql/stage10_import_reports.sql` was applied and the public read policy exists.
- Old/incomplete `matches` rows may remain in Supabase from earlier phases. Data loading must filter out rows missing `match_code`, UTC+8 date, kickoff time, home, or away before rendering.
- Shared schedule helpers may receive raw importer rows (`match_date_cn`) or app rows (`date`). Tests should cover both shapes to prevent UI crashes.
- Browser `localStorage` can contain stale or malformed prediction state from older deployments. Always normalize loaded state and defensively treat score lists as arrays before calling array methods such as `includes`, especially when switching players/dates.
