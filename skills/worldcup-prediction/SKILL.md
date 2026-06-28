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
- `AI推荐` is a special Supabase-backed player created per group and stored in the same `players` / `predictions` tables as human users, so exports and ROI reports include it normally.
- `AI推荐` must not appear in the selectable username grid. In the prediction board it is a passive recommendation marker only: show a small blue star in the top-right corner of each AI-recommended score option. The star must not select the score, change user picks, open a reason panel, or add extra match-card UI. Starred scores are sourced from the current group's Supabase `AI推荐` predictions, not local hardcoded data; use `npm run ai:predict-all` to backfill every active match for every group.
- AI recommendation explanations are global match metadata in `ai_recommendations`, while actual picks for exports/ROI still live as `AI推荐` player predictions per group. The frontend should prefer `ai_recommendations` for strategy name, ROI label, score labels, summaries, and detail modal content, then fall back to local/static recommendation helpers only when DB rows are absent.
- The header action next to export is `AI排行榜`, reading `ai_strategy_stats` paginated by ROI descending. The `...` menu contains `AI策略`, which collects lightweight user strategy prompts into `ai_user_strategies` with `pending` status; do not attempt to evaluate the free-text strategy on the client. The leaderboard must visually distinguish the top three strategies with stable `TOP 1/2/3` badges and rank-specific card styling while keeping mobile card height compact.
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
- Strategy Lab: `npm run strategy:lab` builds local-only artifacts under `docs/artifacts/strategy-lab/<run-id>/` with `strategy.txt`, pre-match `contexts.json`, `predictions.json`, separate `settlements.json`, `verify.json`, and `report.txt`. The core interface is `predict(strategy, context) -> { reason, stakes }`; contexts must never include final scores or result fields.
- Temporary strategy research: `npm run strategy:tem` generates 100-200 deterministic intermediate score strategies, backtests them against pre-match context odds, applies the ROI/coverage gate, and writes artifacts to `strategy_lab/tem_strategy/`. This is research-only; do not change production router or write Supabase predictions from this command.
- Manual AI prediction research lives under `strategy_lab/`: `strategies/main_strategy.md` is the only user-facing strategy, candidate strategies stay under `strategies/candidates/`, per-match research uses `match_info/YYYY-MM-DD_HOME_vs_AWAY/`, and each run writes a timestamped prediction log under `predictions/`.
- Strategy-router production sync uses `npm run ai:predict-router -- --from=YYYY-MM-DD`. Add `--strategy=<strategy_id>` to force one strategy, e.g. `--strategy=context_poisson_ev`. A complete sync must write three surfaces together: `predictions` for the per-group `AI推荐` player, `ai_recommendations` for match-level detail UI, and `ai_strategy_stats`/system rows in `ai_user_strategies` for the leaderboard.
- After refreshing historical context or completed match results, rerun `npm run backtest:candidates` for local review artifacts and `npm run ai:predict-router -- --from=<next untouched match date>` to update Supabase strategy stats plus future AI recommendations. Use a future `from` date when the user has asked not to overwrite same-day predictions.
- Source-backed consensus strategy: `market_consensus_sources` reads `context.strategyContext.externalPredictions` / `context.externalPredictions` style facts with short source names, explicit scores, outcome lean, BTTS, and total-goals lean. Store URLs and brief notes only, not full copyrighted article text. The router should favor it in knockout matches when 3+ usable external predictions exist, and `ai_recommendations.router_reason` must preserve the external-source count plus knockout rationale separately from per-score detail.
- Knockout strategy visualization: the `...` menu contains `淘汰赛策略`, a mobile dialog showing three flagship families (`knockout_stable`, `knockout_value`, `knockout_consensus`) across every version, including discarded failures. First version is frontend-only and reads `src/knockoutStrategyEvolution.mjs`; scores are proxy iteration scores until the offline knockout backtester replaces or refreshes the data. Keep failed versions visible in the main line charts rather than hiding them.
- Knockout proxy backtesting: `src/knockoutProxyBacktest.mjs` defines the first proxy filter and score contract. The filter must not use final scores to decide inclusion; it uses correct-score market shape, `强弱差明显 + 保守盘`, `保守盘`, `末轮压力`, or real knockout stage labels. Scoring maps ROI with `roiPercent + 60` so strategies above roughly `-40%` can remain in exploration, then combines ROI, hit rate, coverage, shape health, and explainability. Keep raw ROI honest, but cap proxy ROI/shape sub-scores when a strategy's best hit is a very high-odds tail score, otherwise one 3-3/75x hit can make a weak shape look like progress.
- Keep the root `README.md` written for humans first: start with what the tool is, why it is fun, and how a WeChat group uses it. Put engineering details after the product story. Architecture diagrams should be split by layer, not compressed into one dense graph: at minimum separate frontend interaction, data update/import, and AI strategy/model engineering.
- Current production router candidates must match the three flagship strategies shown in the frontend knockout strategy view: stable `tem_draw_anchor_capped_1_draw5_5_cap35`, value `tem_poisson_diverse_context_v1_n2_cap35_p0_006`, and consensus `tem_consensus_poisson_context_v1_c1_n4_cap7`. `low_score_basket_4` remains the no-odds fallback, not a normal routed candidate. Dynamic leaderboard candidates are offline/lab material unless explicitly re-enabled.
- Knockout strategy loop: `npm run strategy:knockout-loop` backtests production candidates plus deterministic temporary experiments, writes `docs/artifacts/knockout-strategy-loop/<run-id>/`, and regenerates `src/knockoutStrategyEvolutionData.mjs` for the frontend `淘汰赛策略` dialog. Temporary candidates should be sampled by family, not by raw insertion order, so later generators like Poisson EV and trend are not hidden by early families. When adding a large new subfamily, ensure the loop's `maxCandidates` is high enough to include it; otherwise new candidates can still be hidden behind earlier same-family experiments. After the loop promotes a strategy, add it to `candidateStrategies` with full metadata (`family`, `style`, `parameters`, `explanation`) before rerunning; otherwise the next generated chart may ignore the production version and promote a near-duplicate temp strategy.
- Knockout promotions require a healthy recommendation shape, not just the highest proxy score: average picks should stay roughly 1.5-4, and strategies driven by one very high-odds tail hit should be rejected or recorded as platform cases. Keep platform notes in `docs/knockout-strategy-platform-review.md`.
- Poisson EV flagship strategies live in `src/poissonEvStrategy.mjs` and follow `strategy_lab/skills/poisson_ev_strategy/SKILL.md`. `market_poisson_ev` treats odds as the prior and fits Poisson/Dixon-Coles before context tweaks; `context_poisson_ev` treats pre-match context as the prior and uses odds only for EV.
- Poisson EV iteration should keep multiple named variants instead of mutating the flagship silently. `context_poisson_ev_v2` is a stricter selected-value variant with fewer picks; `context_poisson_ev_v3` is a richer balanced-coverage variant with low-score/draw correction. Compare them using ROI, cost, return, hit count, and average picks per match.
- Match research should keep three layers: `raw/source_extracts.json` for URLs, timestamps, short extracts and extracted facts; `processed/*.json` for high-quality typed summaries; `context.json` as the only authority passed to prediction. Do not store full copyrighted articles in raw files.
- Strategy Lab agent definitions live in `strategy_lab/skills/`: `prematch_context_processor` converts raw extracts to processed/context without predicting, and `clean_strategy_predictor` reads only `main_strategy.md` plus `context.json` to produce `{ reason, stakes }` without browsing or seeing results.
- Historical context backfill uses `npm run historical:contexts` to create market-only contexts for completed matches with odds without overwriting enriched match folders, then `npm run historical:verify` to report required completion, best-effort source coverage, timestamp legality, and backtest eligibility.
- Prematch external source backfill uses `npm run prematch:sources` and writes local files under `strategy_lab/match_info/<match>/` plus reports under `docs/artifacts/strategy-lab/prematch-sources/`. It configures at least three candidate sources per module for team news, form/tactics, market context, and weather/venue. Search/discovery pages are audit/discovery only and must never enter trusted or weak context. Exact timestamps before kickoff in UTC+8 enter trusted `publicContext`; date-only article pages may enter `weakContext` only when their Beijing calendar date is exactly one day before the match kickoff date. By default it preserves existing trusted contexts; pass `--preserveTrusted=false` only for deliberate repair.
- Historical verifier treats `publicContext` and valid `weakContext` as best-effort coverage, but legality is stricter for weak sources: every `sourceGate.weak_source_ids` entry must exist in `sources.weak_sources`, have `enters_context: "weak"`, have no precise `published_at` / `updated_at`, and have a date-only value equal to Beijing day before kickoff. The 2026-06-25 weak-layer run raised historical context coverage to 92/312 = 29.49% with 52/52 legality; the observed weak source was The Stats Zone for `2026-06-24 哥伦比亚 vs 刚果民主共和国`.
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
- ESPN's 2026 World Cup scoreboard can return the full tournament range with `dates=20260611-20260720&limit=300`. Import only resolved matchups: keep real knockout pairings such as `round-of-32`, but skip placeholder teams containing `Winner` or `Loser` until ESPN replaces them with actual teams.
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
- Strategy backtests and live predictions should use the same pre-match context shape. Settlement can read final scores, but `predict(strategy, context)` and saved `contexts.json` must reject leaked fields like `homeScore`, `awayScore`, `actualScore`, or `result`.
- Poisson EV strategies must keep probability generation and EV selection separate. Always validate probability mass over the full Sporttery template, including the three `其他` buckets, before ranking picks.
- Do not promote a Poisson parameter set purely because it tops one historical backtest. Obvious shape bias, such as ungrounded home-team favoritism, should stay out of named strategies unless there is context evidence.
- Router diversity needs explicit feature weighting. If historical ROI is allowed to dominate completely, the router collapses to one or two strategies; scale ROI and add market-fit features so future matches can show varied but explainable recommendations.
- Built-in AI strategy leaderboard rows require stable legal UUIDs because `ai_user_strategies.id` and `ai_strategy_stats.strategy_id` are Postgres `uuid` columns. Use `src/stableUuid.mjs` for deterministic system strategy IDs; do not hand-roll UUID-looking strings with signed integer hex chunks.
- For manual web research, only sources with known publication/update timestamps before kickoff in UTC+8 can enter `context.json`. Coarse timestamps, post-kickoff updates, or pages visibly contaminated with final scores must stay audit-only in `sources.json` or notes.
- Automated source collectors must not treat search result pages as trusted sources. They are only discovery/audit pages, because their page dates can reflect search-page generation rather than article publication.
- Historical verifier reports should not block the batch on single-match problems. Required data and legality determine `canBacktest`; best-effort categories such as media, team news, tactics, weather, external market, and official sources are coverage metrics and should be reported honestly.
