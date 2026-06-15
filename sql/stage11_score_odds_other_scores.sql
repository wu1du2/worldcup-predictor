alter table public.score_odds
  drop constraint if exists score_odds_score_format;

alter table public.score_odds
  add constraint score_odds_score_format
  check (score ~ '^([0-9]+-[0-9]+|[胜平负]其他)$');
