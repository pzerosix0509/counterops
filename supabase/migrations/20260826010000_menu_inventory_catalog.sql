-- Menu filters own menu_type; inventory flags; product <-> SKU FK; unique inventory name.

alter table public.menu_categories
  add column if not exists menu_type public.menu_type not null default 'food';

update public.menu_categories
set menu_type = 'drink'
where lower(name) in ('cà phê', 'ca phe', 'trà', 'tra', 'nước ép', 'nuoc ep', 'đồ uống', 'do uong');

update public.menu_categories
set menu_type = 'food'
where lower(name) in ('đồ ăn', 'do an', 'chiên', 'chien', 'luộc', 'luoc', 'mì', 'mi');

update public.menu_categories
set menu_type = 'service'
where lower(name) in ('dịch vụ', 'dich vu');

update public.menu_categories
set menu_type = 'other'
where lower(name) in ('khác', 'khac');

alter table public.inventory_items
  add column if not exists can_be_ingredient boolean not null default true,
  add column if not exists can_be_sold boolean not null default false;

update public.inventory_items
set can_be_ingredient = true, can_be_sold = false
where item_type = 'ingredient';

update public.inventory_items
set can_be_ingredient = false, can_be_sold = true
where item_type = 'sellable_product';

update public.inventory_items
set can_be_ingredient = true, can_be_sold = false
where item_type in ('packaging', 'other');

alter table public.products
  add column if not exists inventory_item_id uuid references public.inventory_items(id) on delete set null;

create unique index if not exists products_inventory_item_uidx
  on public.products (inventory_item_id)
  where inventory_item_id is not null;

create unique index if not exists inventory_items_org_name_active_uidx
  on public.inventory_items (organization_id, lower(trim(name)))
  where deleted_at is null;

create unique index if not exists menu_categories_org_name_uidx
  on public.menu_categories (organization_id, lower(trim(name)));

-- Regular products: same code, then same name, then demo water bottle mismatch.
update public.products p
set inventory_item_id = i.id
from public.inventory_items i
where p.organization_id = i.organization_id
  and p.inventory_item_id is null
  and p.product_type = 'regular'
  and i.can_be_sold = true
  and p.code = i.code;

update public.products p
set inventory_item_id = i.id
from public.inventory_items i
where p.organization_id = i.organization_id
  and p.inventory_item_id is null
  and p.product_type = 'regular'
  and i.can_be_sold = true
  and lower(trim(p.name)) = lower(trim(i.name));

update public.products p
set inventory_item_id = i.id
from public.inventory_items i
where p.organization_id = i.organization_id
  and p.inventory_item_id is null
  and p.product_type = 'regular'
  and p.code = 'P-NUOC-SUOI'
  and i.code = 'INV-NUOC-SUOI';

update public.products p
set menu_type = c.menu_type
from public.menu_categories c
where p.category_id = c.id;
