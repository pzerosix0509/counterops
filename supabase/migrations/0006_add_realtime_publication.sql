-- Add the POS/Kitchen tables to the supabase_realtime publication so
-- that postgres_changes events fire for them. The realtime client
-- always uses the anon key with RLS enabled, so we only ever see
-- rows the caller is allowed to read.
do $$
begin
  alter publication supabase_realtime add table public.orders;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.order_items;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.dining_tables;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.inventory_balances;
exception
  when duplicate_object then null;
end $$;
