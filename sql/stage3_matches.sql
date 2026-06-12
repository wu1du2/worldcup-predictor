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
add column if not exists active boolean default true,
add column if not exists updated_at timestamptz default now();

alter table matches
add column if not exists home_team_cn text,
add column if not exists away_team_cn text;

create unique index if not exists matches_match_code_key on matches(match_code);
create index if not exists matches_match_date_cn_idx on matches(match_date_cn);
create index if not exists matches_kickoff_at_utc_idx on matches(kickoff_at_utc);

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
