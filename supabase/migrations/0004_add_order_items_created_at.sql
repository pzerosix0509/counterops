alter table public.order_items
  add column if not exists created_at timestamptz not null default now();

create index if not exists order_items_branch_kitchen_created_idx
  on public.order_items(branch_id, kitchen_status, created_at);
