create table if not exists champion_road_predictions (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  player_id text not null references players(id) on delete cascade,
  ranking text not null,
  updated_at text,
  unique (group_id, player_id)
);

create index if not exists champion_road_predictions_group_player_idx
  on champion_road_predictions(group_id, player_id);
