# Cloudflare D1 Fallback Setup

This project now has a first-pass Cloudflare Worker + D1 fallback read path.

## What It Does

- The React app still loads Render static snapshots first.
- If `VITE_D1_API_URL` is configured, the app requests current group state from the Worker:
  - `GET /api/groups/:code/state`
- Supabase remains a fallback during this phase.
- Prediction writes still go to Supabase. D1 write migration is a later phase.

## Files

- Worker API: `workers/d1-api.mjs`
- D1 schema: `sql/d1_schema.sql`
- D1 seed generator: `scripts/buildD1SeedFromBackup.mjs`
- Wrangler config: `wrangler.toml`
- Frontend D1 client: `src/d1Data.mjs`

## One-Time Cloudflare Setup

Run these from the repo root after logging into a Cloudflare account:

```bash
npm exec wrangler@latest login
npm exec wrangler@latest d1 create worldcup-predictor
```

Copy the `database_id` printed by Wrangler into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "worldcup-predictor"
database_id = "<paste database id here>"
```

Initialize schema:

```bash
npm exec wrangler@latest d1 execute worldcup-predictor --remote --file=sql/d1_schema.sql
```

Build seed SQL from the local Supabase backup:

```bash
npm run d1:seed:from-backup
```

Import seed data:

```bash
npm exec wrangler@latest d1 execute worldcup-predictor --remote --file=output/d1-seed.sql
```

Deploy Worker:

```bash
npm exec wrangler@latest deploy
```

Wrangler will print a URL like:

```text
https://worldcup-predictor-api.<account>.workers.dev
```

Set this in Render as a frontend build environment variable:

```text
VITE_D1_API_URL=https://worldcup-predictor-api.<account>.workers.dev
```

Then redeploy the Render static site.

## Verification

Health:

```bash
curl https://worldcup-predictor-api.<account>.workers.dev/api/health
```

Expected:

```json
{"ok":true}
```

Current group state:

```bash
curl https://worldcup-predictor-api.<account>.workers.dev/api/groups/lzscqjd/state
```

Expected shape:

```json
{
  "group": { "id": "...", "code": "lzscqjd", "name": "lzscqjd" },
  "players": [{ "id": "...", "name": "yao" }],
  "predictions": [{ "player_id": "...", "match_id": "espn-...", "scores": ["1-0"] }]
}
```

## Current Limitation

This phase is read-only for D1. It proves the backup DB can restore group state when Supabase is slow, over quota, or unavailable. The next phase is adding D1 writes for:

- `POST /api/groups/:code/players`
- `POST /api/groups/:code/predictions`
