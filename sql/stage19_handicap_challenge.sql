create table if not exists handicap_challenge_matches (
  match_id text primary key,
  match_code text,
  issue text not null,
  date_cn text not null,
  time_cn text not null,
  kickoff_at_utc text,
  home_cn text not null,
  away_cn text not null,
  handicap integer not null,
  odds_win real not null,
  odds_draw real not null,
  odds_loss real not null,
  probability_win real not null,
  probability_draw real not null,
  probability_loss real not null,
  active integer not null default 1,
  updated_at text,
  created_at text
);

create index if not exists handicap_challenge_matches_active_date_idx
  on handicap_challenge_matches(active, date_cn, time_cn);

create table if not exists handicap_challenge_predictions (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  player_id text not null references players(id) on delete cascade,
  match_id text not null references handicap_challenge_matches(match_id) on delete cascade,
  choice_key text not null check (choice_key in ('win', 'draw', 'loss')),
  updated_at text,
  unique (group_id, player_id, match_id)
);

create index if not exists handicap_challenge_predictions_group_player_idx
  on handicap_challenge_predictions(group_id, player_id);

insert into handicap_challenge_matches (
  match_id, match_code, issue, date_cn, time_cn, kickoff_at_utc,
  home_cn, away_cn, handicap,
  odds_win, odds_draw, odds_loss,
  probability_win, probability_draw, probability_loss,
  active, updated_at, created_at
) values
  (
    'hc-20260710-france-morocco', 'espn-760510', '周四097', '2026-07-10', '04:00', '2026-07-09T20:00:00.000Z',
    '法国', '摩洛哥', -1,
    2.48, 3.05, 2.51,
    0.35699463260633363, 0.2902776029061336, 0.3527277644875328,
    1, '2026-07-09T08:00:00.000Z', '2026-07-09T08:00:00.000Z'
  ),
  (
    'hc-20260711-spain-belgium', 'espn-760511', '周五098', '2026-07-11', '03:00', '2026-07-10T19:00:00.000Z',
    '西班牙', '比利时', -1,
    2.58, 3.26, 2.30,
    0.34327100921127324, 0.2716684674126028, 0.385060523376124,
    1, '2026-07-09T08:00:00.000Z', '2026-07-09T08:00:00.000Z'
  ),
  (
    'hc-20260712-norway-england', 'espn-760512', '周六099', '2026-07-12', '05:00', '2026-07-11T21:00:00.000Z',
    '挪威', '英格兰', 1,
    1.88, 3.50, 3.22,
    0.47147709968372964, 0.2532505564015462, 0.2752723439147241,
    1, '2026-07-09T08:00:00.000Z', '2026-07-09T08:00:00.000Z'
  ),
  (
    'hc-20260712-argentina-switzerland', 'espn-760513', '周六100', '2026-07-12', '09:00', '2026-07-12T01:00:00.000Z',
    '阿根廷', '瑞士', -1,
    3.00, 3.10, 2.11,
    0.2950250327003744, 0.2855080961616526, 0.4194668711379731,
    1, '2026-07-09T08:00:00.000Z', '2026-07-09T08:00:00.000Z'
  )
on conflict(match_id) do update set
  match_code = excluded.match_code,
  issue = excluded.issue,
  date_cn = excluded.date_cn,
  time_cn = excluded.time_cn,
  kickoff_at_utc = excluded.kickoff_at_utc,
  home_cn = excluded.home_cn,
  away_cn = excluded.away_cn,
  handicap = excluded.handicap,
  odds_win = excluded.odds_win,
  odds_draw = excluded.odds_draw,
  odds_loss = excluded.odds_loss,
  probability_win = excluded.probability_win,
  probability_draw = excluded.probability_draw,
  probability_loss = excluded.probability_loss,
  active = excluded.active,
  updated_at = excluded.updated_at;
