alter table public.score_odds
  add column if not exists kickoff_at_cn timestamptz;

alter table public.score_odds_trends
  add column if not exists kickoff_at_cn timestamptz;

create index if not exists score_odds_kickoff_at_cn_idx
  on public.score_odds (kickoff_at_cn, score)
  where kickoff_at_cn is not null;

create index if not exists score_odds_trends_kickoff_at_cn_idx
  on public.score_odds_trends (kickoff_at_cn, score)
  where kickoff_at_cn is not null;
