-- supabase/migrations/20260901000000_tables_rls_split.sql
-- Split RLS on areas/rooms/dining_tables so that:
--   * owner/admin/manager may manage structure (add/edit/delete areas, rooms, tables)
--   * staff may only update a table's status (and read), not add/edit/delete structure
-- Replaces the previous single "for all" write policies which granted structure
-- changes to cashier/reception as well.

-- Default allowed write roles for structure management.
-- Matching roles array literal used below.

drop policy if exists areas_all on public.areas;
create policy areas_read on public.areas for select to authenticated
  using (public.is_org_member(organization_id));

create policy areas_insert on public.areas for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['owner','admin','manager'])
  );

create policy areas_update on public.areas for update to authenticated
  using (public.is_org_member(organization_id))
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['owner','admin','manager'])
  );

create policy areas_delete on public.areas for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['owner','admin','manager'])
  );

drop policy if exists rooms_all on public.rooms;
create policy rooms_read on public.rooms for select to authenticated
  using (public.is_org_member(organization_id));

create policy rooms_insert on public.rooms for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['owner','admin','manager'])
  );

create policy rooms_update on public.rooms for update to authenticated
  using (public.is_org_member(organization_id))
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['owner','admin','manager'])
  );

create policy rooms_delete on public.rooms for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['owner','admin','manager'])
  );

drop policy if exists dining_tables_all on public.dining_tables;

-- Everyone in the org may read tables.
create policy dining_tables_read on public.dining_tables for select to authenticated
  using (public.is_org_member(organization_id));

-- Only management may add/edit/delete tables (structure).
create policy dining_tables_insert on public.dining_tables for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['owner','admin','manager'])
  );

-- Management may fully edit; staff/cashier/reception may only flip status.
create policy dining_tables_management_update on public.dining_tables for update to authenticated
  using (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['owner','admin','manager'])
  )
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['owner','admin','manager'])
  );

create policy dining_tables_status_update on public.dining_tables for update to authenticated
  using (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['owner','admin','manager','cashier','reception','staff'])
  )
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['owner','admin','manager','cashier','reception','staff'])
  );

create policy dining_tables_delete on public.dining_tables for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['owner','admin','manager'])
  );
