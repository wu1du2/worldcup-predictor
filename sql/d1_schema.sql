pragma foreign_keys = on;

create table if not exists groups (
  id text primary key,
  code text not null unique,
  name text not null,
  created_at text
);

create table if not exists players (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  name text not null,
  created_at text,
  unique (group_id, name)
);

create index if not exists players_group_created_idx
  on players(group_id, created_at);

create table if not exists predictions (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  player_id text not null references players(id) on delete cascade,
  match_id text not null,
  scores text not null,
  updated_at text,
  unique (group_id, player_id, match_id)
);

create index if not exists predictions_group_idx
  on predictions(group_id);

create table if not exists matches (
  match_code text primary key,
  match_date_cn text,
  time_cn text,
  kickoff_at_utc text,
  home text,
  away text,
  home_cn text,
  away_cn text,
  home_score integer,
  away_score integer,
  settlement_home_score integer,
  settlement_away_score integer,
  settlement_score_source text,
  status text,
  status_detail text,
  stage text,
  active integer not null default 1,
  updated_at text
);

create index if not exists matches_date_time_idx
  on matches(match_date_cn, time_cn);

create table if not exists score_odds (
  id text primary key,
  source text not null,
  source_match_key text not null,
  home text not null,
  away text not null,
  kickoff_label text not null,
  score text not null,
  odds real not null,
  kickoff_at_cn text,
  updated_at text,
  created_at text,
  unique (source, source_match_key, score)
);

create index if not exists score_odds_match_idx
  on score_odds(source, home, away, kickoff_label);

create index if not exists score_odds_kickoff_at_cn_idx
  on score_odds(kickoff_at_cn, score)
  where kickoff_at_cn is not null;

create table if not exists score_odds_trends (
  id text primary key,
  source text not null,
  source_match_key text not null,
  home text not null,
  away text not null,
  kickoff_label text not null,
  score text not null,
  first_odds real not null,
  latest_odds real not null,
  change_pct real not null,
  first_seen_at text,
  latest_seen_at text,
  snapshots_count integer not null,
  kickoff_at_cn text,
  updated_at text,
  created_at text,
  unique (source, source_match_key, score)
);

create index if not exists score_odds_trends_match_idx
  on score_odds_trends(source, home, away, kickoff_label);

create index if not exists score_odds_trends_kickoff_at_cn_idx
  on score_odds_trends(kickoff_at_cn, score)
  where kickoff_at_cn is not null;

create table if not exists ai_recommendations (
  match_id text primary key,
  scores text not null,
  score_labels text not null,
  strategy_id text not null,
  strategy_name text not null,
  strategy_roi real,
  strategy_roi_label text not null,
  strategy_feature text not null,
  router_reason text not null,
  match_reason_summary text not null,
  match_reason_detail text not null,
  prediction_summary text not null,
  context_version text,
  prediction_run_id text,
  predicted_at text,
  source_file text,
  created_at text,
  updated_at text
);

create index if not exists ai_recommendations_predicted_at_idx
  on ai_recommendations(predicted_at desc);

create table if not exists ai_strategy_stats (
  strategy_id text primary key,
  strategy_name text not null,
  matches_count integer not null default 0,
  cost real not null default 0,
  revenue real not null default 0,
  profit real not null default 0,
  roi real not null default 0,
  updated_at text
);

create table if not exists import_reports (
  id text primary key,
  job_name text not null,
  status text not null,
  started_at text not null,
  finished_at text not null,
  rows_written integer not null default 0,
  items_seen integer not null default 0,
  message text not null default '',
  error_detail text not null default '',
  run_url text not null default '',
  created_at text
);

create index if not exists import_reports_job_created_idx
  on import_reports(job_name, created_at desc);

create index if not exists import_reports_created_at_idx
  on import_reports(created_at desc);
