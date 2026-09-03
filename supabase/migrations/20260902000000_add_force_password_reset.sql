-- ============================================================
-- Add force_password_reset flag to public.profiles
-- ============================================================
-- This flag is set to TRUE when an Owner provisions an account
-- for an employee. On first login the employee is routed to
-- /change-password; after they save a new password the flag is
-- cleared and they proceed to their designated module.
-- ============================================================

alter table public.profiles
  add column if not exists force_password_reset boolean not null default false;

-- Existing users (owners who registered themselves) should NOT
-- be forced to reset, so the default false is correct.
-- The flag is set to true programmatically by the server action
-- when provisionAccountForEmployee / createEmployeeWithAuth runs.

-- No RLS change needed: profiles is already readable by the owner
-- and by the profile owner (existing policy covers this).

