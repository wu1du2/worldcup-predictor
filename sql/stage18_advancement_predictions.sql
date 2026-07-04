create table if not exists advancement_predictions (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  player_id text not null references players(id) on delete cascade,
  match_id text not null references matches(match_code) on delete cascade,
  winner_side text not null check (winner_side in ('home', 'away')),
  winner_name text not null,
  updated_at text,
  unique (group_id, player_id, match_id)
);

create index if not exists advancement_predictions_group_player_idx
  on advancement_predictions(group_id, player_id);
