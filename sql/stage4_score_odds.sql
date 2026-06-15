create table if not exists public.score_odds (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_match_key text not null,
  home text not null,
  away text not null,
  kickoff_label text not null,
  score text not null,
  odds numeric not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint score_odds_unique unique (source, source_match_key, score),
  constraint score_odds_score_format check (score ~ '^([0-9]+-[0-9]+|[胜平负]其他)$'),
  constraint score_odds_positive check (odds > 1)
);

create index if not exists score_odds_match_key_idx
  on public.score_odds (source, source_match_key);

alter table public.score_odds enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'score_odds'
      and policyname = 'score_odds_public_read'
  ) then
    create policy score_odds_public_read
      on public.score_odds
      for select
      using (true);
  end if;
end $$;
