create table if not exists public.odds_import_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_date date not null,
  source_url text not null,
  raw_html text not null,
  parsed_json jsonb not null,
  matches_count integer not null default 0,
  rows_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists odds_import_snapshots_source_date_created_idx
  on public.odds_import_snapshots(source, source_date, created_at desc);

alter table public.odds_import_snapshots enable row level security;
