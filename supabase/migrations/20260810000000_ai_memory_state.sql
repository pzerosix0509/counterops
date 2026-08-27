-- Structured conversation memory: lưu JSON state (range, metric, dimensions,
-- grain, comparison, chart, query gần nhất) để follow-up hiểu ngữ cảnh chính xác.
alter table public.ai_chat_sessions
  add column if not exists memory_state jsonb;

create index if not exists ai_chat_sessions_memory_state_idx
  on public.ai_chat_sessions using gin (memory_state);
