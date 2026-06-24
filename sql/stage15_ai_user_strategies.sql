create table if not exists public.ai_user_strategies (
  id uuid primary key default gen_random_uuid(),

  group_code text,
  author_name text,
  strategy_name text not null,
  strategy_prompt text not null,

  status text not null default 'pending',
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ai_user_strategies_status_check
    check (status in ('pending', 'implemented', 'backtested', 'rejected'))
);

create index if not exists ai_user_strategies_created_at_idx
  on public.ai_user_strategies (created_at desc);

create index if not exists ai_user_strategies_status_idx
  on public.ai_user_strategies (status);

create table if not exists public.ai_strategy_stats (
  strategy_id uuid primary key references public.ai_user_strategies(id) on delete cascade,

  strategy_name text not null,

  matches_count integer not null default 0,
  cost numeric not null default 0,
  revenue numeric not null default 0,
  profit numeric not null default 0,
  roi numeric not null default 0,

  updated_at timestamptz not null default now()
);

create index if not exists ai_strategy_stats_roi_idx
  on public.ai_strategy_stats (roi desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ai_user_strategies_updated_at on public.ai_user_strategies;

create trigger set_ai_user_strategies_updated_at
before update on public.ai_user_strategies
for each row
execute function public.set_updated_at();

alter table public.ai_user_strategies enable row level security;
alter table public.ai_strategy_stats enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_user_strategies'
      and policyname = 'ai_user_strategies_public_insert'
  ) then
    create policy ai_user_strategies_public_insert
      on public.ai_user_strategies
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_user_strategies'
      and policyname = 'ai_user_strategies_public_read'
  ) then
    create policy ai_user_strategies_public_read
      on public.ai_user_strategies
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_strategy_stats'
      and policyname = 'ai_strategy_stats_public_read'
  ) then
    create policy ai_strategy_stats_public_read
      on public.ai_strategy_stats
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;
