-- Add common takeaway/delivery sales channels for existing organizations.
insert into public.sales_channels (organization_id, name, type, is_active)
select o.id, c.name, c.type, true
from public.organizations o
cross join (
  values
    ('GrabFood'::text, 'delivery'::text),
    ('ShopeeFood'::text, 'delivery'::text),
    ('BeFood'::text, 'delivery'::text)
) as c(name, type)
where not exists (
  select 1
  from public.sales_channels s
  where s.organization_id = o.id
    and lower(s.name) = lower(c.name)
);
