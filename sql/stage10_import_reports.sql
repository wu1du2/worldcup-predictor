create table if not exists public.import_reports (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null check (status in ('success', 'failed')),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  rows_written integer not null default 0,
  items_seen integer not null default 0,
  message text not null default '',
  error_detail text not null default '',
  run_url text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists import_reports_job_created_idx
  on public.import_reports (job_name, created_at desc);

alter table public.import_reports enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'import_reports'
      and policyname = 'import_reports_public_read'
  ) then
    create policy import_reports_public_read
      on public.import_reports
      for select
      using (true);
  end if;
end $$;
