create extension if not exists vector with schema extensions;

alter table public.ai_document_chunks
  add column if not exists embedding extensions.vector(1536),
  add column if not exists embedding_model text;

create table if not exists public.ai_dashboard_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  description text,
  prompt text not null,
  spec jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_dashboard_templates_org_created_idx
  on public.ai_dashboard_templates(organization_id, created_at desc);

alter table public.ai_dashboard_templates enable row level security;

drop policy if exists ai_dashboard_templates_all on public.ai_dashboard_templates;
create policy ai_dashboard_templates_all on public.ai_dashboard_templates for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager','cashier']));

create or replace function public.match_ai_document_chunks(
  p_org_id uuid,
  p_branch_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 6,
  p_match_threshold float default 0.72
)
returns table (
  id uuid,
  document_id uuid,
  title text,
  file_name text,
  chunk_index int,
  content text,
  similarity float
)
language sql
stable
as $$
  select
    c.id,
    c.document_id,
    d.title,
    d.file_name,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.ai_document_chunks c
  join public.ai_documents d on d.id = c.document_id
  where c.organization_id = p_org_id
    and c.embedding is not null
    and (p_branch_id is null or c.branch_id is null or c.branch_id = p_branch_id)
    and public.is_org_member(p_org_id)
    and 1 - (c.embedding <=> p_query_embedding) >= p_match_threshold
  order by c.embedding <=> p_query_embedding
  limit greatest(1, least(p_match_count, 20));
$$;
