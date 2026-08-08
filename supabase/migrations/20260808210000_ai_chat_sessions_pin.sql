-- Add pin support to AI chat sessions for the session context menu.
alter table public.ai_chat_sessions
  add column if not exists is_pinned boolean not null default false;

create index if not exists ai_chat_sessions_pinned_idx
  on public.ai_chat_sessions(user_id, organization_id, branch_id, is_pinned desc, last_message_at desc);
