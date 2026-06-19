-- supabase/migrations/0002_fix_has_org_role.sql
-- Fix for: "function public.has_org_role(uuid, text[]) does not exist"
-- 0001 declared the parameter as membership_role[] but policies pass text[].
-- Re-create it accepting text[] and casting internally.

create or replace function public.has_org_role(p_org_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(allowed_roles::membership_role[])
  );
$$;

-- Permission: keep the function callable by authenticated users (RLS still
-- restricts the underlying table reads via membership checks inside the body).
grant execute on function public.has_org_role(uuid, text[]) to authenticated;