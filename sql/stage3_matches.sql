create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'espn',
  name_en text not null,
  name_cn text not null,
  abbreviation text,
  updated_at timestamptz default now(),
  unique (source, name_en)
);

alter table teams enable row level security;

drop policy if exists "Allow anon read teams" on teams;
drop policy if exists "Allow anon insert teams" on teams;
drop policy if exists "Allow anon update teams" on teams;

create policy "Allow anon read teams"
on teams for select
to anon
using (true);

create policy "Allow anon insert teams"
on teams for insert
to anon
with check (true);

create policy "Allow anon update teams"
on teams for update
to anon
using (true)
with check (true);

alter table matches
add column if not exists match_code text,
add column if not exists kickoff_at_utc timestamptz,
add column if not exists match_date_cn date,
add column if not exists time_cn text,
add column if not exists home text,
add column if not exists away text,
add column if not exists home_cn text,
add column if not exists away_cn text,
add column if not exists stage text default 'Group Stage',
add column if not exists group_name text,
add column if not exists venue text,
add column if not exists status text default 'pre',
add column if not exists status_detail text,
add column if not exists home_score integer,
add column if not exists away_score integer,
add column if not exists winner text,
add column if not exists source text,
add column if not exists home_team_id uuid,
add column if not exists away_team_id uuid,
add column if not exists active boolean default true,
add column if not exists updated_at timestamptz default now();

alter table matches
add column if not exists home_team_cn text,
add column if not exists away_team_cn text;

create unique index if not exists matches_match_code_key on matches(match_code);
create index if not exists matches_match_date_cn_idx on matches(match_date_cn);
create index if not exists matches_kickoff_at_utc_idx on matches(kickoff_at_utc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'matches_home_team_id_fkey'
  ) then
    alter table matches
    add constraint matches_home_team_id_fkey
    foreign key (home_team_id) references teams(id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'matches_away_team_id_fkey'
  ) then
    alter table matches
    add constraint matches_away_team_id_fkey
    foreign key (away_team_id) references teams(id);
  end if;
end $$;

alter table matches enable row level security;

drop policy if exists "Allow anon read matches" on matches;
drop policy if exists "Allow anon insert matches" on matches;
drop policy if exists "Allow anon update matches" on matches;

create policy "Allow anon read matches"
on matches for select
to anon
using (true);

create policy "Allow anon insert matches"
on matches for insert
to anon
with check (true);

create policy "Allow anon update matches"
on matches for update
to anon
using (true)
with check (true);
