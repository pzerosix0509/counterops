create extension if not exists pg_trgm;

create table if not exists public.ai_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  title text not null,
  file_name text not null,
  mime_type text,
  source_type text not null default 'upload',
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_document_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  document_id uuid not null references public.ai_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists ai_documents_org_created_idx
  on public.ai_documents(organization_id, created_at desc);
create index if not exists ai_document_chunks_org_doc_idx
  on public.ai_document_chunks(organization_id, document_id, chunk_index);
create index if not exists ai_document_chunks_content_trgm_idx
  on public.ai_document_chunks using gin (content gin_trgm_ops);

alter table public.ai_documents enable row level security;
alter table public.ai_document_chunks enable row level security;

drop policy if exists ai_documents_all on public.ai_documents;
create policy ai_documents_all on public.ai_documents for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']));

drop policy if exists ai_document_chunks_all on public.ai_document_chunks;
create policy ai_document_chunks_all on public.ai_document_chunks for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']));

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
as $$
  with paid_orders as (
    select o.*
    from public.orders o
    where o.organization_id = p_org_id
      and o.branch_id = p_branch_id
      and o.status = 'paid'
      and o.opened_at >= p_from
      and o.opened_at <= p_to
      and public.has_branch_access(p_org_id, p_branch_id)
  ),
  item_costs as (
    select coalesce(sum(oi.cost_price_snapshot * oi.quantity), 0)::bigint as cost_of_goods
    from public.order_items oi
    join paid_orders po on po.id = oi.order_id
  ),
  order_totals as (
    select
      count(*)::int as total_orders,
      coalesce(sum(po.total_amount), 0)::bigint as net_revenue,
      coalesce(sum(round(po.total_amount * (coalesce(sc.platform_fee_percent, 0) / 100.0))), 0)::bigint as channel_fees
    from paid_orders po
    left join public.sales_channels sc on sc.id = po.sales_channel_id
  )
  select
    ot.total_orders,
    ot.net_revenue,
    ic.cost_of_goods,
    ot.net_revenue - ic.cost_of_goods as gross_profit,
    ot.channel_fees,
    ot.net_revenue - ic.cost_of_goods - ot.channel_fees as net_profit
  from order_totals ot
  cross join item_costs ic;
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
as $$
  select
    oi.product_name_snapshot as product_name,
    sum(oi.quantity) as quantity,
    sum(oi.unit_price_snapshot * oi.quantity)::bigint as revenue,
    sum(oi.cost_price_snapshot * oi.quantity)::bigint as cost_of_goods,
    sum((oi.unit_price_snapshot - oi.cost_price_snapshot) * oi.quantity)::bigint as gross_profit
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.organization_id = p_org_id
    and o.branch_id = p_branch_id
    and o.status = 'paid'
    and o.opened_at >= p_from
    and o.opened_at <= p_to
    and public.has_branch_access(p_org_id, p_branch_id)
  group by oi.product_name_snapshot
  order by revenue desc
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
as $$
  select
    coalesce(sc.name, case o.order_type when 'dine_in' then 'Tại quán' when 'takeaway' then 'Mang đi' else o.order_type::text end) as channel_name,
    count(*)::int as orders,
    coalesce(sum(o.total_amount), 0)::bigint as revenue,
    coalesce(sum(round(o.total_amount * (coalesce(sc.platform_fee_percent, 0) / 100.0))), 0)::bigint as channel_fees
  from public.orders o
  left join public.sales_channels sc on sc.id = o.sales_channel_id
  where o.organization_id = p_org_id
    and o.branch_id = p_branch_id
    and o.status = 'paid'
    and o.opened_at >= p_from
    and o.opened_at <= p_to
    and public.has_branch_access(p_org_id, p_branch_id)
  group by channel_name
  order by revenue desc;
$$;
