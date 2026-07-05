alter table public.ai_runs
  add column if not exists intent text,
  add column if not exists response_mode text,
  add column if not exists confidence_score numeric(5, 4),
  add column if not exists telemetry jsonb not null default '{}'::jsonb;

create index if not exists ai_runs_intent_created_idx
  on public.ai_runs(organization_id, branch_id, intent, created_at desc)
  where intent is not null;
