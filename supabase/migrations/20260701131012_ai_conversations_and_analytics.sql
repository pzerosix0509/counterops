-- Persistent AI conversations, governed analytics tools, hybrid retrieval,
-- and request-level observability.

alter table public.ai_document_chunks
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('simple', coalesce(content, ''))) stored;

create index if not exists ai_document_chunks_search_vector_idx
  on public.ai_document_chunks using gin (search_vector);

create index if not exists ai_document_chunks_embedding_hnsw_idx
  on public.ai_document_chunks using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

drop trigger if exists trg_ai_dashboard_templates_updated_at on public.ai_dashboard_templates;
create trigger trg_ai_dashboard_templates_updated_at
before update on public.ai_dashboard_templates
for each row execute function public.set_updated_at();

drop policy if exists ai_documents_all on public.ai_documents;
create policy ai_documents_all on public.ai_documents
for all to authenticated
using (
  public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
  and (branch_id is null or public.has_branch_access(organization_id, branch_id))
)
with check (
  public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
  and (branch_id is null or public.has_branch_access(organization_id, branch_id))
);

drop policy if exists ai_document_chunks_all on public.ai_document_chunks;
create policy ai_document_chunks_all on public.ai_document_chunks
for all to authenticated
using (
  public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
  and (branch_id is null or public.has_branch_access(organization_id, branch_id))
)
with check (
  public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
  and (branch_id is null or public.has_branch_access(organization_id, branch_id))
);

drop policy if exists ai_dashboard_templates_all on public.ai_dashboard_templates;
create policy ai_dashboard_templates_all on public.ai_dashboard_templates
for all to authenticated
using (
  public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
  and (branch_id is null or public.has_branch_access(organization_id, branch_id))
)
with check (
  public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
  and (branch_id is null or public.has_branch_access(organization_id, branch_id))
);

create table if not exists public.ai_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Cuộc trò chuyện mới',
  mode text not null default 'chat' check (mode in ('chat', 'dashboard')),
  memory_summary text,
  message_count int not null default 0 check (message_count >= 0),
  last_message_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_ai_chat_sessions_updated_at on public.ai_chat_sessions;
create trigger trg_ai_chat_sessions_updated_at
before update on public.ai_chat_sessions
for each row execute function public.set_updated_at();

create index if not exists ai_chat_sessions_user_recent_idx
  on public.ai_chat_sessions(user_id, organization_id, branch_id, last_message_at desc)
  where archived_at is null;
create index if not exists ai_chat_sessions_org_branch_idx
  on public.ai_chat_sessions(organization_id, branch_id);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  session_id uuid not null references public.ai_chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  response_json jsonb,
  tool_calls jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  model_used text,
  client_request_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_messages_session_created_idx
  on public.ai_chat_messages(session_id, created_at, id);
create index if not exists ai_chat_messages_org_branch_idx
  on public.ai_chat_messages(organization_id, branch_id);
drop index if exists public.ai_chat_messages_session_request_uniq;
create unique index ai_chat_messages_session_request_uniq
  on public.ai_chat_messages(session_id, client_request_id)
  where client_request_id is not null and role = 'user';
create index if not exists ai_chat_messages_request_lookup_idx
  on public.ai_chat_messages(session_id, client_request_id, role)
  where client_request_id is not null;

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.ai_chat_sessions(id) on delete set null,
  assistant_message_id uuid references public.ai_chat_messages(id) on delete set null,
  mode text not null check (mode in ('chat', 'dashboard')),
  provider text,
  model text,
  status text not null check (status in ('success', 'fallback', 'error')),
  tool_calls jsonb not null default '[]'::jsonb,
  source_count int not null default 0 check (source_count >= 0),
  prompt_tokens int not null default 0 check (prompt_tokens >= 0),
  completion_tokens int not null default 0 check (completion_tokens >= 0),
  total_tokens int not null default 0 check (total_tokens >= 0),
  estimated_cost_usd numeric(14, 8),
  latency_ms int not null default 0 check (latency_ms >= 0),
  fallback_reason text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists ai_runs_org_branch_created_idx
  on public.ai_runs(organization_id, branch_id, created_at desc);
create index if not exists ai_runs_user_created_idx
  on public.ai_runs(user_id, created_at desc);
create index if not exists ai_runs_session_idx
  on public.ai_runs(session_id, created_at desc)
  where session_id is not null;
create index if not exists ai_runs_assistant_message_idx
  on public.ai_runs(assistant_message_id)
  where assistant_message_id is not null;

create table if not exists public.ai_message_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  message_id uuid not null references public.ai_chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id, user_id)
);

drop trigger if exists trg_ai_message_feedback_updated_at on public.ai_message_feedback;
create trigger trg_ai_message_feedback_updated_at
before update on public.ai_message_feedback
for each row execute function public.set_updated_at();

create index if not exists ai_message_feedback_org_created_idx
  on public.ai_message_feedback(organization_id, created_at desc);

alter table public.ai_chat_sessions enable row level security;
alter table public.ai_chat_messages enable row level security;
alter table public.ai_runs enable row level security;
alter table public.ai_message_feedback enable row level security;

drop policy if exists ai_chat_sessions_select on public.ai_chat_sessions;
create policy ai_chat_sessions_select on public.ai_chat_sessions
for select to authenticated
using (
  user_id = (select auth.uid())
  and public.has_branch_access(organization_id, branch_id)
);

drop policy if exists ai_chat_sessions_insert on public.ai_chat_sessions;
create policy ai_chat_sessions_insert on public.ai_chat_sessions
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_branch_access(organization_id, branch_id)
);

drop policy if exists ai_chat_sessions_update on public.ai_chat_sessions;
create policy ai_chat_sessions_update on public.ai_chat_sessions
for update to authenticated
using (
  user_id = (select auth.uid())
  and public.has_branch_access(organization_id, branch_id)
)
with check (
  user_id = (select auth.uid())
  and public.has_branch_access(organization_id, branch_id)
);

drop policy if exists ai_chat_sessions_delete on public.ai_chat_sessions;
create policy ai_chat_sessions_delete on public.ai_chat_sessions
for delete to authenticated
using (
  user_id = (select auth.uid())
  and public.has_branch_access(organization_id, branch_id)
);

drop policy if exists ai_chat_messages_select on public.ai_chat_messages;
create policy ai_chat_messages_select on public.ai_chat_messages
for select to authenticated
using (
  exists (
    select 1
    from public.ai_chat_sessions s
    where s.id = ai_chat_messages.session_id
      and s.user_id = (select auth.uid())
      and public.has_branch_access(s.organization_id, s.branch_id)
  )
);

drop policy if exists ai_chat_messages_insert on public.ai_chat_messages;
create policy ai_chat_messages_insert on public.ai_chat_messages
for insert to authenticated
with check (
  exists (
    select 1
    from public.ai_chat_sessions s
    where s.id = ai_chat_messages.session_id
      and s.organization_id = ai_chat_messages.organization_id
      and s.branch_id = ai_chat_messages.branch_id
      and s.user_id = (select auth.uid())
      and public.has_branch_access(s.organization_id, s.branch_id)
  )
);

drop policy if exists ai_runs_select on public.ai_runs;
create policy ai_runs_select on public.ai_runs
for select to authenticated
using (
  user_id = (select auth.uid())
  and public.has_branch_access(organization_id, branch_id)
);

drop policy if exists ai_runs_insert on public.ai_runs;
create policy ai_runs_insert on public.ai_runs
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_branch_access(organization_id, branch_id)
);

drop policy if exists ai_message_feedback_all on public.ai_message_feedback;
create policy ai_message_feedback_all on public.ai_message_feedback
for all to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.ai_chat_messages m
    join public.ai_chat_sessions s on s.id = m.session_id
    where m.id = ai_message_feedback.message_id
      and s.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.ai_chat_messages m
    join public.ai_chat_sessions s on s.id = m.session_id
    where m.id = ai_message_feedback.message_id
      and s.user_id = (select auth.uid())
      and s.organization_id = ai_message_feedback.organization_id
      and s.branch_id = ai_message_feedback.branch_id
  )
);

grant select, insert, update, delete on public.ai_chat_sessions to authenticated;
grant select, insert on public.ai_chat_messages to authenticated;
grant select, insert on public.ai_runs to authenticated;
grant select, insert, update, delete on public.ai_message_feedback to authenticated;

create or replace function public.ai_sales_summary(
  p_org_id uuid,
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  total_orders int,
  net_revenue bigint,
  cost_of_goods bigint,
  gross_profit bigint,
  channel_fees bigint,
  net_profit bigint
)
language sql
stable
set search_path = ''
as $$
  with payment_times as (
    select p.order_id, max(p.paid_at) as paid_at
    from public.payments p
    where p.organization_id = p_org_id
      and p.branch_id = p_branch_id
    group by p.order_id
  ),
  item_costs as (
    select
      oi.order_id,
      coalesce(sum(oi.cost_price_snapshot * oi.quantity)
        filter (where oi.cancelled_at is null), 0)::bigint as cost_of_goods
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.organization_id = p_org_id
      and oi.branch_id = p_branch_id
      and o.status = 'paid'
    group by oi.order_id
  ),
  paid_orders as (
    select
      o.id,
      o.total_amount,
      coalesce(ic.cost_of_goods, 0)::bigint as cost_of_goods,
      round(o.total_amount * (coalesce(sc.platform_fee_percent, 0) / 100.0))::bigint as channel_fee,
      coalesce(o.closed_at, pt.paid_at, o.opened_at) as paid_at
    from public.orders o
    left join payment_times pt on pt.order_id = o.id
    left join item_costs ic on ic.order_id = o.id
    left join public.sales_channels sc on sc.id = o.sales_channel_id
    where o.organization_id = p_org_id
      and o.branch_id = p_branch_id
      and o.status = 'paid'
      and public.has_branch_access(p_org_id, p_branch_id)
      and public.has_org_role(p_org_id, array['owner', 'admin', 'manager', 'cashier'])
  ),
  filtered as (
    select *
    from paid_orders
    where paid_at >= p_from and paid_at <= p_to
  )
  select
    count(*)::int,
    coalesce(sum(total_amount), 0)::bigint,
    coalesce(sum(cost_of_goods), 0)::bigint,
    coalesce(sum(total_amount - cost_of_goods), 0)::bigint,
    coalesce(sum(channel_fee), 0)::bigint,
    coalesce(sum(total_amount - cost_of_goods - channel_fee), 0)::bigint
  from filtered;
$$;

create or replace function public.ai_top_products(
  p_org_id uuid,
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit int default 10
)
returns table (
  product_name text,
  quantity numeric,
  revenue bigint,
  cost_of_goods bigint,
  gross_profit bigint
)
language sql
stable
set search_path = ''
as $$
  with payment_times as (
    select p.order_id, max(p.paid_at) as paid_at
    from public.payments p
    where p.organization_id = p_org_id
      and p.branch_id = p_branch_id
    group by p.order_id
  ),
  paid_orders as (
    select o.id
    from public.orders o
    left join payment_times pt on pt.order_id = o.id
    where o.organization_id = p_org_id
      and o.branch_id = p_branch_id
      and o.status = 'paid'
      and coalesce(o.closed_at, pt.paid_at, o.opened_at) >= p_from
      and coalesce(o.closed_at, pt.paid_at, o.opened_at) <= p_to
      and public.has_branch_access(p_org_id, p_branch_id)
      and public.has_org_role(p_org_id, array['owner', 'admin', 'manager', 'cashier'])
  )
  select
    oi.product_name_snapshot,
    sum(oi.quantity),
    sum(oi.unit_price_snapshot * oi.quantity)::bigint,
    sum(oi.cost_price_snapshot * oi.quantity)::bigint,
    sum((oi.unit_price_snapshot - oi.cost_price_snapshot) * oi.quantity)::bigint
  from public.order_items oi
  join paid_orders po on po.id = oi.order_id
  where oi.cancelled_at is null
  group by oi.product_name_snapshot
  order by sum(oi.unit_price_snapshot * oi.quantity) desc
  limit greatest(1, least(p_limit, 50));
$$;

create or replace function public.ai_channel_summary(
  p_org_id uuid,
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  channel_name text,
  orders int,
  revenue bigint,
  channel_fees bigint
)
language sql
stable
set search_path = ''
as $$
  with payment_times as (
    select p.order_id, max(p.paid_at) as paid_at
    from public.payments p
    where p.organization_id = p_org_id
      and p.branch_id = p_branch_id
    group by p.order_id
  )
  select
    coalesce(
      sc.name,
      case o.order_type
        when 'dine_in' then 'Tại quán'
        when 'takeaway' then 'Mang đi'
        else o.order_type::text
      end
    ),
    count(*)::int,
    coalesce(sum(o.total_amount), 0)::bigint,
    coalesce(sum(round(o.total_amount * (coalesce(sc.platform_fee_percent, 0) / 100.0))), 0)::bigint
  from public.orders o
  left join payment_times pt on pt.order_id = o.id
  left join public.sales_channels sc on sc.id = o.sales_channel_id
  where o.organization_id = p_org_id
    and o.branch_id = p_branch_id
    and o.status = 'paid'
    and coalesce(o.closed_at, pt.paid_at, o.opened_at) >= p_from
    and coalesce(o.closed_at, pt.paid_at, o.opened_at) <= p_to
    and public.has_branch_access(p_org_id, p_branch_id)
    and public.has_org_role(p_org_id, array['owner', 'admin', 'manager', 'cashier'])
  group by 1
  order by 3 desc;
$$;

create or replace function public.ai_sales_timeseries(
  p_org_id uuid,
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_granularity text default 'day',
  p_timezone text default 'Asia/Bangkok'
)
returns table (
  period_start timestamptz,
  total_orders int,
  net_revenue bigint,
  cost_of_goods bigint,
  gross_profit bigint,
  channel_fees bigint,
  net_profit bigint
)
language sql
stable
set search_path = ''
as $$
  with payment_times as (
    select p.order_id, max(p.paid_at) as paid_at
    from public.payments p
    where p.organization_id = p_org_id
      and p.branch_id = p_branch_id
    group by p.order_id
  ),
  item_costs as (
    select
      oi.order_id,
      coalesce(sum(oi.cost_price_snapshot * oi.quantity)
        filter (where oi.cancelled_at is null), 0)::bigint as cost_of_goods
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.organization_id = p_org_id
      and oi.branch_id = p_branch_id
      and o.status = 'paid'
    group by oi.order_id
  ),
  facts as (
    select
      (
        date_trunc(
          case when p_granularity in ('hour', 'day', 'week', 'month') then p_granularity else 'day' end,
          coalesce(o.closed_at, pt.paid_at, o.opened_at) at time zone p_timezone
        ) at time zone p_timezone
      ) as bucket,
      o.total_amount,
      coalesce(ic.cost_of_goods, 0)::bigint as cost_of_goods,
      round(o.total_amount * (coalesce(sc.platform_fee_percent, 0) / 100.0))::bigint as channel_fee
    from public.orders o
    left join payment_times pt on pt.order_id = o.id
    left join item_costs ic on ic.order_id = o.id
    left join public.sales_channels sc on sc.id = o.sales_channel_id
    where o.organization_id = p_org_id
      and o.branch_id = p_branch_id
      and o.status = 'paid'
      and coalesce(o.closed_at, pt.paid_at, o.opened_at) >= p_from
      and coalesce(o.closed_at, pt.paid_at, o.opened_at) <= p_to
      and public.has_branch_access(p_org_id, p_branch_id)
      and public.has_org_role(p_org_id, array['owner', 'admin', 'manager', 'cashier'])
  )
  select
    bucket,
    count(*)::int,
    coalesce(sum(total_amount), 0)::bigint,
    coalesce(sum(cost_of_goods), 0)::bigint,
    coalesce(sum(total_amount - cost_of_goods), 0)::bigint,
    coalesce(sum(channel_fee), 0)::bigint,
    coalesce(sum(total_amount - cost_of_goods - channel_fee), 0)::bigint
  from facts
  group by bucket
  order by bucket;
$$;

create or replace function public.ai_category_summary(
  p_org_id uuid,
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit int default 20
)
returns table (
  category_id uuid,
  category_name text,
  quantity numeric,
  revenue bigint,
  cost_of_goods bigint,
  gross_profit bigint
)
language sql
stable
set search_path = ''
as $$
  with payment_times as (
    select p.order_id, max(p.paid_at) as paid_at
    from public.payments p
    where p.organization_id = p_org_id
      and p.branch_id = p_branch_id
    group by p.order_id
  ),
  paid_orders as (
    select o.id
    from public.orders o
    left join payment_times pt on pt.order_id = o.id
    where o.organization_id = p_org_id
      and o.branch_id = p_branch_id
      and o.status = 'paid'
      and coalesce(o.closed_at, pt.paid_at, o.opened_at) >= p_from
      and coalesce(o.closed_at, pt.paid_at, o.opened_at) <= p_to
      and public.has_branch_access(p_org_id, p_branch_id)
      and public.has_org_role(p_org_id, array['owner', 'admin', 'manager', 'cashier'])
  )
  select
    c.id,
    coalesce(c.name, 'Không phân loại'),
    sum(oi.quantity),
    sum(oi.unit_price_snapshot * oi.quantity)::bigint,
    sum(oi.cost_price_snapshot * oi.quantity)::bigint,
    sum((oi.unit_price_snapshot - oi.cost_price_snapshot) * oi.quantity)::bigint
  from public.order_items oi
  join paid_orders po on po.id = oi.order_id
  left join public.products product on product.id = oi.product_id
  left join public.menu_categories c on c.id = product.category_id
  where oi.cancelled_at is null
  group by c.id, c.name
  order by sum(oi.unit_price_snapshot * oi.quantity) desc
  limit greatest(1, least(p_limit, 50));
$$;

create or replace function public.ai_period_comparison(
  p_org_id uuid,
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  current_orders int,
  previous_orders int,
  orders_delta_percent numeric,
  current_revenue bigint,
  previous_revenue bigint,
  revenue_delta_percent numeric,
  current_profit bigint,
  previous_profit bigint,
  profit_delta_percent numeric
)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select
      p_from as current_from,
      p_to as current_to,
      p_from - (p_to - p_from) - interval '1 microsecond' as previous_from,
      p_from - interval '1 microsecond' as previous_to
  ),
  current_period as (
    select *
    from public.ai_sales_summary(
      p_org_id,
      p_branch_id,
      (select current_from from bounds),
      (select current_to from bounds)
    )
  ),
  previous_period as (
    select *
    from public.ai_sales_summary(
      p_org_id,
      p_branch_id,
      (select previous_from from bounds),
      (select previous_to from bounds)
    )
  )
  select
    c.total_orders,
    p.total_orders,
    case when p.total_orders = 0 then null
      else round(((c.total_orders - p.total_orders)::numeric / p.total_orders) * 100, 2)
    end,
    c.net_revenue,
    p.net_revenue,
    case when p.net_revenue = 0 then null
      else round(((c.net_revenue - p.net_revenue)::numeric / p.net_revenue) * 100, 2)
    end,
    c.net_profit,
    p.net_profit,
    case when p.net_profit = 0 then null
      else round(((c.net_profit - p.net_profit)::numeric / abs(p.net_profit)) * 100, 2)
    end
  from current_period c
  cross join previous_period p;
$$;

create or replace function public.hybrid_search_ai_document_chunks(
  p_org_id uuid,
  p_branch_id uuid,
  p_query_text text,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 6,
  p_full_text_weight float default 1,
  p_semantic_weight float default 1,
  p_rrf_k int default 50
)
returns table (
  id uuid,
  document_id uuid,
  title text,
  file_name text,
  chunk_index int,
  content text,
  similarity float,
  fusion_score float,
  keyword_rank bigint,
  semantic_rank bigint
)
language sql
stable
set search_path = ''
as $$
  with keyword as (
    select
      c.id,
      row_number() over (
        order by ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', p_query_text)) desc
      ) as rank_ix
    from public.ai_document_chunks c
    where c.organization_id = p_org_id
      and (c.branch_id is null or c.branch_id = p_branch_id)
      and nullif(trim(p_query_text), '') is not null
      and c.search_vector @@ websearch_to_tsquery('simple', p_query_text)
      and public.has_branch_access(p_org_id, p_branch_id)
      and public.has_org_role(p_org_id, array['owner', 'admin', 'manager', 'cashier'])
    order by rank_ix
    limit least(greatest(p_match_count, 1), 30) * 2
  ),
  semantic as (
    select
      c.id,
      row_number() over (
        order by c.embedding OPERATOR(extensions.<=>) p_query_embedding
      ) as rank_ix,
      1 - (
        c.embedding OPERATOR(extensions.<=>) p_query_embedding
      ) as similarity
    from public.ai_document_chunks c
    where c.organization_id = p_org_id
      and (c.branch_id is null or c.branch_id = p_branch_id)
      and c.embedding is not null
      and p_query_embedding is not null
      and public.has_branch_access(p_org_id, p_branch_id)
      and public.has_org_role(p_org_id, array['owner', 'admin', 'manager', 'cashier'])
    order by c.embedding OPERATOR(extensions.<=>) p_query_embedding
    limit least(greatest(p_match_count, 1), 30) * 2
  ),
  fused as (
    select
      coalesce(k.id, s.id) as id,
      k.rank_ix as keyword_rank,
      s.rank_ix as semantic_rank,
      s.similarity,
      (
        coalesce(1.0 / (p_rrf_k + k.rank_ix), 0.0) * p_full_text_weight
        + coalesce(1.0 / (p_rrf_k + s.rank_ix), 0.0) * p_semantic_weight
      ) as fusion_score
    from keyword k
    full outer join semantic s on s.id = k.id
  )
  select
    c.id,
    c.document_id,
    d.title,
    d.file_name,
    c.chunk_index,
    c.content,
    f.similarity,
    f.fusion_score,
    f.keyword_rank,
    f.semantic_rank
  from fused f
  join public.ai_document_chunks c on c.id = f.id
  join public.ai_documents d on d.id = c.document_id
  order by f.fusion_score desc
  limit least(greatest(p_match_count, 1), 30);
$$;

create or replace function public.ai_usage_summary(
  p_org_id uuid,
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  total_runs bigint,
  total_tokens bigint,
  estimated_cost_usd numeric,
  fallback_runs bigint,
  average_latency_ms numeric
)
language sql
stable
set search_path = ''
as $$
  select
    count(*)::bigint,
    coalesce(sum(r.total_tokens), 0)::bigint,
    coalesce(sum(r.estimated_cost_usd), 0)::numeric,
    count(*) filter (where r.status = 'fallback')::bigint,
    coalesce(round(avg(r.latency_ms), 2), 0)::numeric
  from public.ai_runs r
  where r.organization_id = p_org_id
    and r.branch_id = p_branch_id
    and r.created_at >= p_from
    and r.created_at <= p_to
    and public.has_branch_access(p_org_id, p_branch_id)
    and public.has_org_role(p_org_id, array['owner', 'admin', 'manager', 'cashier']);
$$;

revoke execute on function public.ai_sales_summary(uuid, uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.ai_top_products(uuid, uuid, timestamptz, timestamptz, int) from public, anon;
revoke execute on function public.ai_channel_summary(uuid, uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.ai_sales_timeseries(uuid, uuid, timestamptz, timestamptz, text, text) from public, anon;
revoke execute on function public.ai_category_summary(uuid, uuid, timestamptz, timestamptz, int) from public, anon;
revoke execute on function public.ai_period_comparison(uuid, uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.hybrid_search_ai_document_chunks(
  uuid, uuid, text, extensions.vector, int, float, float, int
) from public, anon;
revoke execute on function public.ai_usage_summary(uuid, uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.match_ai_document_chunks(
  uuid, uuid, extensions.vector, int, float
) from public, anon;

grant execute on function public.ai_sales_summary(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.ai_top_products(uuid, uuid, timestamptz, timestamptz, int) to authenticated;
grant execute on function public.ai_channel_summary(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.ai_sales_timeseries(uuid, uuid, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.ai_category_summary(uuid, uuid, timestamptz, timestamptz, int) to authenticated;
grant execute on function public.ai_period_comparison(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.hybrid_search_ai_document_chunks(
  uuid, uuid, text, extensions.vector, int, float, float, int
) to authenticated;
grant execute on function public.ai_usage_summary(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.match_ai_document_chunks(
  uuid, uuid, extensions.vector, int, float
) to authenticated;
