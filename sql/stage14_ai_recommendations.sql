create table if not exists public.ai_recommendations (
  match_id text primary key,

  scores text[] not null,
  score_labels text[] not null,

  strategy_id text not null,
  strategy_name text not null,
  strategy_roi numeric,
  strategy_roi_label text not null,
  strategy_feature text not null,

  router_reason text not null,
  match_reason_summary text not null,
  match_reason_detail text not null,
  prediction_summary text not null,

  context_version text,
  prediction_run_id text,
  predicted_at timestamptz not null default now(),
  source_file text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ai_recommendations_scores_nonempty check (array_length(scores, 1) > 0),
  constraint ai_recommendations_score_labels_nonempty check (array_length(score_labels, 1) > 0)
);

create index if not exists ai_recommendations_predicted_at_idx
  on public.ai_recommendations (predicted_at desc);

create index if not exists ai_recommendations_prediction_run_id_idx
  on public.ai_recommendations (prediction_run_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ai_recommendations_updated_at on public.ai_recommendations;

create trigger set_ai_recommendations_updated_at
before update on public.ai_recommendations
for each row
execute function public.set_updated_at();

alter table public.ai_recommendations enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_recommendations'
      and policyname = 'ai_recommendations_public_read'
  ) then
    create policy ai_recommendations_public_read
      on public.ai_recommendations
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;
