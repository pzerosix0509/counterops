-- Analytics: customer features, RFM rules, feedback, clusters, demand snapshots.

create table if not exists public.customer_features (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  age int,
  recency_days int not null,
  frequency int not null,
  monetary numeric not null,
  avg_order_value numeric not null,
  avg_order_interval numeric not null,
  weekend_ratio numeric not null,
  dinner_ratio numeric not null,
  favorite_category text,
  favorite_dish_id uuid references public.products(id) on delete set null,
  web_visit_count int not null default 0,
  dish_view_count int not null default 0,
  avg_rating numeric,
  sentiment_score numeric,
  r_score int,
  f_score int,
  m_score int,
  rfm_segment text,
  cluster_id int,
  computed_at timestamptz not null,
  unique (branch_id, customer_id)
);
create index if not exists customer_features_org_branch_idx
  on public.customer_features(organization_id, branch_id);
create index if not exists customer_features_branch_segment_idx
  on public.customer_features(branch_id, rfm_segment);

create table if not exists public.rfm_segment_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  segment text not null,
  r_min int not null,
  r_max int not null,
  f_min int not null,
  f_max int not null,
  m_min int not null,
  m_max int not null,
  priority int not null
);
create unique index if not exists rfm_segment_rules_global_segment_uniq
  on public.rfm_segment_rules (segment)
  where organization_id is null and branch_id is null;
create unique index if not exists rfm_segment_rules_org_branch_segment_uniq
  on public.rfm_segment_rules (organization_id, branch_id, segment)
  where organization_id is not null and branch_id is not null;

insert into public.rfm_segment_rules (
  organization_id, branch_id, segment, r_min, r_max, f_min, f_max, m_min, m_max, priority
)
values
  (null, null, 'Champions', 4, 5, 4, 5, 4, 5, 5),
  (null, null, 'Loyal Customers', 3, 5, 4, 5, 3, 5, 4),
  (null, null, 'Potential Loyalists', 4, 5, 1, 3, 2, 5, 3),
  (null, null, 'At Risk', 1, 2, 3, 5, 3, 5, 2),
  (null, null, 'Lost', 1, 2, 1, 2, 1, 5, 1)
on conflict do nothing;

create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  rating int not null check (rating >= 1 and rating <= 5),
  feedback_text text,
  sentiment_label text,
  sentiment_score numeric,
  model_name text,
  scored_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists customer_feedback_org_branch_created_idx
  on public.customer_feedback(organization_id, branch_id, created_at desc);
create index if not exists customer_feedback_customer_idx
  on public.customer_feedback(customer_id)
  where customer_id is not null;

create table if not exists public.customer_clusters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  k int not null,
  silhouette numeric,
  feature_names text[] not null default '{}',
  profiles jsonb not null default '{}'::jsonb,
  fitted_at timestamptz not null default now()
);
create index if not exists customer_clusters_org_branch_idx
  on public.customer_clusters(organization_id, branch_id, fitted_at desc);

create table if not exists public.demand_forecasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  horizon_days int not null,
  method text not null,
  product_id uuid references public.products(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete cascade,
  target_date date not null,
  forecast_qty numeric not null,
  lower_qty numeric,
  upper_qty numeric,
  computed_at timestamptz not null default now()
);
create index if not exists demand_forecasts_org_branch_date_idx
  on public.demand_forecasts(organization_id, branch_id, target_date);

alter table public.customer_features enable row level security;
alter table public.rfm_segment_rules enable row level security;
alter table public.customer_feedback enable row level security;
alter table public.customer_clusters enable row level security;
alter table public.demand_forecasts enable row level security;

drop policy if exists customer_features_all on public.customer_features;
create policy customer_features_all on public.customer_features for all to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
    and public.has_branch_access(organization_id, branch_id)
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
    and public.has_branch_access(organization_id, branch_id)
  );

drop policy if exists rfm_segment_rules_select on public.rfm_segment_rules;
create policy rfm_segment_rules_select on public.rfm_segment_rules for select to authenticated
  using (
    (organization_id is null and branch_id is null)
    or (
      public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
      and public.has_branch_access(organization_id, branch_id)
    )
  );

drop policy if exists rfm_segment_rules_write on public.rfm_segment_rules;
create policy rfm_segment_rules_write on public.rfm_segment_rules for all to authenticated
  using (
    organization_id is not null
    and branch_id is not null
    and public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    and public.has_branch_access(organization_id, branch_id)
  )
  with check (
    organization_id is not null
    and branch_id is not null
    and public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    and public.has_branch_access(organization_id, branch_id)
  );

drop policy if exists customer_feedback_all on public.customer_feedback;
create policy customer_feedback_all on public.customer_feedback for all to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
    and public.has_branch_access(organization_id, branch_id)
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
    and public.has_branch_access(organization_id, branch_id)
  );

drop policy if exists customer_clusters_all on public.customer_clusters;
create policy customer_clusters_all on public.customer_clusters for all to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
    and public.has_branch_access(organization_id, branch_id)
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
    and public.has_branch_access(organization_id, branch_id)
  );

drop policy if exists demand_forecasts_all on public.demand_forecasts;
create policy demand_forecasts_all on public.demand_forecasts for all to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
    and public.has_branch_access(organization_id, branch_id)
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
    and public.has_branch_access(organization_id, branch_id)
  );

grant select, insert, update, delete on public.customer_features to authenticated;
grant select, insert, update, delete on public.rfm_segment_rules to authenticated;
grant select, insert, update, delete on public.customer_feedback to authenticated;
grant select, insert, update, delete on public.customer_clusters to authenticated;
grant select, insert, update, delete on public.demand_forecasts to authenticated;

create or replace function public.refresh_customer_features(
  p_org uuid,
  p_branch uuid,
  p_as_of timestamptz
)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int := 0;
begin
  if not public.has_branch_access(p_org, p_branch)
     or not public.has_org_role(p_org, array['owner', 'admin', 'manager', 'cashier']) then
    raise exception 'not authorized';
  end if;

  with paid as (
    select o.id, o.customer_id, o.total_amount, o.opened_at
    from public.orders o
    where o.organization_id = p_org
      and o.branch_id = p_branch
      and o.status = 'paid'
      and o.customer_id is not null
      and o.opened_at <= p_as_of
  ),
  stats as (
    select
      customer_id,
      (p_as_of::date - max(opened_at)::date)::int as recency_days,
      count(*)::int as frequency,
      sum(total_amount)::numeric as monetary,
      min(opened_at)::date as first_date,
      max(opened_at)::date as last_date,
      (count(*) filter (
        where extract(dow from opened_at at time zone 'Asia/Ho_Chi_Minh') in (0, 6)
      ))::numeric / nullif(count(*), 0) as weekend_ratio,
      (count(*) filter (
        where extract(hour from opened_at at time zone 'Asia/Ho_Chi_Minh') between 17 and 21
      ))::numeric / nullif(count(*), 0) as dinner_ratio
    from paid
    group by customer_id
  ),
  dish_counts as (
    select
      p.customer_id,
      oi.product_id,
      sum(oi.quantity) as qty
    from paid p
    join public.order_items oi on oi.order_id = p.id
    where oi.cancelled_at is null
      and oi.product_id is not null
      and oi.organization_id = p_org
      and oi.branch_id = p_branch
    group by p.customer_id, oi.product_id
  ),
  fav as (
    select distinct on (customer_id)
      customer_id,
      product_id
    from dish_counts
    order by customer_id, qty desc, product_id
  ),
  feedback as (
    select
      cf.customer_id,
      avg(cf.rating)::numeric as avg_rating,
      avg(cf.sentiment_score)::numeric as sentiment_score
    from public.customer_feedback cf
    where cf.organization_id = p_org
      and cf.branch_id = p_branch
      and cf.customer_id is not null
    group by cf.customer_id
  ),
  upserted as (
    insert into public.customer_features (
      organization_id,
      branch_id,
      customer_id,
      age,
      recency_days,
      frequency,
      monetary,
      avg_order_value,
      avg_order_interval,
      weekend_ratio,
      dinner_ratio,
      favorite_category,
      favorite_dish_id,
      web_visit_count,
      dish_view_count,
      avg_rating,
      sentiment_score,
      computed_at
    )
    select
      p_org,
      p_branch,
      s.customer_id,
      case
        when c.birthday is null then null
        else (date_part('year', p_as_of) - date_part('year', c.birthday))::int
      end,
      s.recency_days,
      s.frequency,
      s.monetary,
      s.monetary / s.frequency,
      case
        when s.frequency = 1 then s.recency_days::numeric
        else (s.last_date - s.first_date)::numeric / greatest(s.frequency - 1, 1)
      end,
      coalesce(s.weekend_ratio, 0),
      coalesce(s.dinner_ratio, 0),
      mc.name,
      f.product_id,
      0,
      0,
      fb.avg_rating,
      fb.sentiment_score,
      p_as_of
    from stats s
    join public.customers c on c.id = s.customer_id
    left join fav f on f.customer_id = s.customer_id
    left join public.products pr on pr.id = f.product_id
    left join public.menu_categories mc on mc.id = pr.category_id
    left join feedback fb on fb.customer_id = s.customer_id
    on conflict (branch_id, customer_id) do update set
      organization_id = excluded.organization_id,
      age = excluded.age,
      recency_days = excluded.recency_days,
      frequency = excluded.frequency,
      monetary = excluded.monetary,
      avg_order_value = excluded.avg_order_value,
      avg_order_interval = excluded.avg_order_interval,
      weekend_ratio = excluded.weekend_ratio,
      dinner_ratio = excluded.dinner_ratio,
      favorite_category = excluded.favorite_category,
      favorite_dish_id = excluded.favorite_dish_id,
      web_visit_count = excluded.web_visit_count,
      dish_view_count = excluded.dish_view_count,
      avg_rating = excluded.avg_rating,
      sentiment_score = excluded.sentiment_score,
      computed_at = excluded.computed_at
    returning 1
  )
  select count(*)::int into v_count from upserted;

  return v_count;
end;
$$;

create or replace function public.ai_rfm_summary(
  p_org_id uuid,
  p_branch_id uuid
)
returns table (
  rfm_segment text,
  customer_count int,
  avg_monetary numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    cf.rfm_segment,
    count(*)::int,
    avg(cf.monetary)::numeric
  from public.customer_features cf
  where cf.organization_id = p_org_id
    and cf.branch_id = p_branch_id
    and public.has_branch_access(p_org_id, p_branch_id)
    and public.has_org_role(p_org_id, array['owner', 'admin', 'manager', 'cashier'])
  group by cf.rfm_segment;
$$;

create or replace function public.ai_rfm_customers(
  p_org_id uuid,
  p_branch_id uuid,
  p_segment text
)
returns table (
  customer_id uuid,
  recency_days int,
  frequency int,
  monetary numeric,
  r_score int,
  f_score int,
  m_score int,
  rfm_segment text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    cf.customer_id,
    cf.recency_days,
    cf.frequency,
    cf.monetary,
    cf.r_score,
    cf.f_score,
    cf.m_score,
    cf.rfm_segment
  from public.customer_features cf
  where cf.organization_id = p_org_id
    and cf.branch_id = p_branch_id
    and cf.rfm_segment = p_segment
    and public.has_branch_access(p_org_id, p_branch_id)
    and public.has_org_role(p_org_id, array['owner', 'admin', 'manager', 'cashier'])
  order by cf.monetary desc
  limit 50;
$$;

create or replace function public.ai_sentiment_summary(
  p_org_id uuid,
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  sentiment_label text,
  feedback_count int,
  avg_rating numeric,
  avg_sentiment_score numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    cf.sentiment_label,
    count(*)::int,
    avg(cf.rating)::numeric,
    avg(cf.sentiment_score)::numeric
  from public.customer_feedback cf
  where cf.organization_id = p_org_id
    and cf.branch_id = p_branch_id
    and cf.created_at >= p_from
    and cf.created_at <= p_to
    and public.has_branch_access(p_org_id, p_branch_id)
    and public.has_org_role(p_org_id, array['owner', 'admin', 'manager', 'cashier'])
  group by cf.sentiment_label;
$$;

-- dish demand includes paid walk-ins (customer_id may be null)
create or replace function public.ai_dish_demand_series(
  p_org_id uuid,
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  product_id uuid,
  day date,
  qty numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    oi.product_id,
    (o.opened_at at time zone 'Asia/Ho_Chi_Minh')::date as day,
    sum(oi.quantity)::numeric as qty
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.organization_id = p_org_id
    and o.branch_id = p_branch_id
    and o.status = 'paid'
    and o.opened_at >= p_from
    and o.opened_at <= p_to
    and oi.cancelled_at is null
    and oi.product_id is not null
    and oi.organization_id = p_org_id
    and oi.branch_id = p_branch_id
    and public.has_branch_access(p_org_id, p_branch_id)
    and public.has_org_role(p_org_id, array['owner', 'admin', 'manager', 'cashier'])
  group by oi.product_id, (o.opened_at at time zone 'Asia/Ho_Chi_Minh')::date
  order by 2, 1;
$$;

revoke execute on function public.refresh_customer_features(uuid, uuid, timestamptz) from public, anon;
revoke execute on function public.ai_rfm_summary(uuid, uuid) from public, anon;
revoke execute on function public.ai_rfm_customers(uuid, uuid, text) from public, anon;
revoke execute on function public.ai_sentiment_summary(uuid, uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.ai_dish_demand_series(uuid, uuid, timestamptz, timestamptz) from public, anon;

grant execute on function public.refresh_customer_features(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.ai_rfm_summary(uuid, uuid) to authenticated;
grant execute on function public.ai_rfm_customers(uuid, uuid, text) to authenticated;
grant execute on function public.ai_sentiment_summary(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.ai_dish_demand_series(uuid, uuid, timestamptz, timestamptz) to authenticated;
