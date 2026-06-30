# D1 Fallback DB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Cloudflare Worker + D1 fallback database path so the app can read and later write group state without depending on Supabase.

**Architecture:** Render continues serving the React app and static snapshots. The frontend reads static JSON first, then a thin Worker API backed by Cloudflare D1, then Supabase as a temporary fallback. D1 stores normalized core business state only; large logs remain outside the main DB.

**Tech Stack:** React/Vite frontend, Cloudflare Worker JavaScript module syntax, Cloudflare D1 SQLite, Node built-in tests and scripts.

---

### Task 1: D1 Schema And Backup Export

**Files:**
- Create: `sql/d1_schema.sql`
- Create: `src/d1BackupExport.mjs`
- Create: `scripts/buildD1SeedFromBackup.mjs`
- Test: `tests/d1BackupExport.test.mjs`

- [ ] Write tests for SQL escaping, table truncation order, and lzscqjd group/player/prediction export.
- [ ] Implement the D1 schema with `groups`, `players`, `predictions`, `matches`, `score_odds`, `score_odds_trends`, `ai_recommendations`, `ai_strategy_stats`, and `import_reports`.
- [ ] Implement backup JSON to SQLite insert SQL generation.
- [ ] Run `node --test tests/d1BackupExport.test.mjs`.

### Task 2: Worker API Read Path

**Files:**
- Create: `workers/d1-api.mjs`
- Test: `tests/d1WorkerApi.test.mjs`

- [ ] Write tests for `GET /api/health`, `GET /api/groups/:code/state`, and CORS.
- [ ] Implement small route helpers and D1 query helpers.
- [ ] Verify `lzscqjd` returns `group`, ordered `players`, and raw prediction rows.

### Task 3: Frontend D1 Provider

**Files:**
- Create: `src/d1Data.mjs`
- Modify: `src/main.jsx`
- Test: `tests/d1Data.test.mjs`

- [ ] Write tests for Worker response normalization into current app state.
- [ ] Add `VITE_D1_API_URL` based browser client.
- [ ] In `refreshGroupState`, load static snapshots first, then D1 group state, then Supabase fallback.

### Task 4: Local Acceptance

**Files:**
- Create or update: `output/playwright/*`

- [ ] Build D1 seed SQL from the local backup.
- [ ] Run unit tests and production build.
- [ ] Use Playwright iPhone 13 with Supabase mocked as 402 and Worker API mocked from fixture data.
- [ ] Save screenshot and state JSON.

### Task 5: Cloudflare Setup Notes

**Files:**
- Create: `docs/d1-fallback-setup.md`
- Modify: `skills/worldcup-prediction/SKILL.md`

- [ ] Document exact Cloudflare resources needed from the user.
- [ ] Document deploy commands using Wrangler and D1 import commands.
- [ ] Record project lesson in the project skill.
