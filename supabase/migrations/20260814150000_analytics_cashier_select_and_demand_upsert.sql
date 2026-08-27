-- Cashiers may read analytics snapshots but must not write them.
-- Demand forecast replace uses upsert on a unique cell key.

delete from public.demand_forecasts a
using public.demand_forecasts b
where a.branch_id = b.branch_id
  and a.target_date = b.target_date
  and a.product_id is not distinct from b.product_id
  and a.inventory_item_id is not distinct from b.inventory_item_id
  and (
    a.computed_at < b.computed_at
    or (a.computed_at = b.computed_at and a.ctid < b.ctid)
  );

alter table public.demand_forecasts
  drop constraint if exists demand_forecasts_branch_date_entity_key;

alter table public.demand_forecasts
  add constraint demand_forecasts_branch_date_entity_key
  unique nulls not distinct (branch_id, target_date, product_id, inventory_item_id);

drop policy if exists customer_features_all on public.customer_features;
drop policy if exists customer_features_select on public.customer_features;
drop policy if exists customer_features_insert on public.customer_features;
drop policy if exists customer_features_update on public.customer_features;
drop policy if exists customer_features_delete on public.customer_features;
create policy customer_features_select on public.customer_features
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
    and public.has_branch_access(organization_id, branch_id)
  );
create policy customer_features_insert on public.customer_features
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    and public.has_branch_access(organization_id, branch_id)
  );
create policy customer_features_update on public.customer_features
  for update to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    and public.has_branch_access(organization_id, branch_id)
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    and public.has_branch_access(organization_id, branch_id)
  );
create policy customer_features_delete on public.customer_features
  for delete to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    and public.has_branch_access(organization_id, branch_id)
  );

drop policy if exists customer_clusters_all on public.customer_clusters;
drop policy if exists customer_clusters_select on public.customer_clusters;
drop policy if exists customer_clusters_insert on public.customer_clusters;
drop policy if exists customer_clusters_update on public.customer_clusters;
drop policy if exists customer_clusters_delete on public.customer_clusters;
create policy customer_clusters_select on public.customer_clusters
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
    and public.has_branch_access(organization_id, branch_id)
  );
create policy customer_clusters_insert on public.customer_clusters
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    and public.has_branch_access(organization_id, branch_id)
  );
create policy customer_clusters_update on public.customer_clusters
  for update to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    and public.has_branch_access(organization_id, branch_id)
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    and public.has_branch_access(organization_id, branch_id)
  );
create policy customer_clusters_delete on public.customer_clusters
  for delete to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    and public.has_branch_access(organization_id, branch_id)
  );

drop policy if exists demand_forecasts_all on public.demand_forecasts;
drop policy if exists demand_forecasts_select on public.demand_forecasts;
drop policy if exists demand_forecasts_insert on public.demand_forecasts;
drop policy if exists demand_forecasts_update on public.demand_forecasts;
drop policy if exists demand_forecasts_delete on public.demand_forecasts;
create policy demand_forecasts_select on public.demand_forecasts
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
    and public.has_branch_access(organization_id, branch_id)
  );
create policy demand_forecasts_insert on public.demand_forecasts
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    and public.has_branch_access(organization_id, branch_id)
  );
create policy demand_forecasts_update on public.demand_forecasts
  for update to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    and public.has_branch_access(organization_id, branch_id)
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    and public.has_branch_access(organization_id, branch_id)
  );
create policy demand_forecasts_delete on public.demand_forecasts
  for delete to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    and public.has_branch_access(organization_id, branch_id)
  );

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
     or not public.has_org_role(p_org, array['owner', 'admin', 'manager']) then
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
