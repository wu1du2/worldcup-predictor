create table if not exists public.score_odds_trends (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_match_key text not null,
  home text not null,
  away text not null,
  kickoff_label text not null,
  score text not null,
  first_odds numeric not null,
  latest_odds numeric not null,
  change_pct numeric not null,
  first_seen_at timestamptz not null,
  latest_seen_at timestamptz not null,
  snapshots_count integer not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source, source_match_key, score)
);

create index if not exists score_odds_trends_match_idx
  on public.score_odds_trends(source, home, away, kickoff_label);

alter table public.score_odds_trends enable row level security;

drop policy if exists score_odds_trends_public_read on public.score_odds_trends;
create policy score_odds_trends_public_read
  on public.score_odds_trends
  for select
  using (true);
