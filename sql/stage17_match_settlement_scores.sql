alter table public.matches
  add column if not exists settlement_home_score integer;

alter table public.matches
  add column if not exists settlement_away_score integer;

alter table public.matches
  add column if not exists settlement_score_source text;

update public.matches
set
  settlement_home_score = home_score,
  settlement_away_score = away_score,
  settlement_score_source = 'final'
where status = 'post'
  and home_score is not null
  and away_score is not null
  and (settlement_home_score is null or settlement_away_score is null)
  and coalesce(status_detail, '') !~* '(AET|PEN|After Extra Time|Penalties)';
