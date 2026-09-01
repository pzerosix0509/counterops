-- =============================================================
-- Migration: 20260901_grab_integration.sql
-- Purpose: Add Grab mock integration (orders extension + config + event logging)
-- =============================================================

-- ===== EXTEND ORDERS TABLE =====
-- Add fields to track Grab external ID and sync status
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS grab_external_id TEXT,
  ADD COLUMN IF NOT EXISTS grab_sync_status TEXT NOT NULL DEFAULT 'none'
    CHECK (grab_sync_status IN ('none', 'pending', 'accepted', 'rejected', 'synced', 'cancelled'));

-- Index for quick lookup by Grab external ID
CREATE INDEX IF NOT EXISTS orders_grab_external_id_idx
  ON public.orders(grab_external_id)
  WHERE grab_external_id IS NOT NULL;

-- ===== CREATE GRAB_STORE_CONFIG TABLE =====
-- Per-branch configuration for Grab mock integration (online status, merchant ID, last sync times)
CREATE TABLE IF NOT EXISTS public.grab_store_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  is_online BOOLEAN NOT NULL DEFAULT false,
  merchant_id TEXT,
  last_menu_sync_at TIMESTAMPTZ,
  last_order_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT grab_store_config_unique_branch UNIQUE(branch_id)
);

-- Trigger to auto-update updated_at timestamp
DROP TRIGGER IF EXISTS trg_grab_store_config_updated_at ON public.grab_store_config;
CREATE TRIGGER trg_grab_store_config_updated_at
BEFORE UPDATE ON public.grab_store_config
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS grab_store_config_org_idx
  ON public.grab_store_config(organization_id);

CREATE INDEX IF NOT EXISTS grab_store_config_branch_idx
  ON public.grab_store_config(branch_id);

-- Enable and set RLS policies for grab_store_config
ALTER TABLE public.grab_store_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grab_store_config_all ON public.grab_store_config;
CREATE POLICY grab_store_config_all ON public.grab_store_config
  FOR ALL TO authenticated
  USING (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    AND public.has_branch_access(organization_id, branch_id)
  )
  WITH CHECK (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    AND public.has_branch_access(organization_id, branch_id)
  );

-- ===== CREATE GRAB_SYNC_EVENTS TABLE =====
-- Append-only event log for all Grab integration activities
CREATE TABLE IF NOT EXISTS public.grab_sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'order_received', 'order_accepted', 'order_rejected', 'order_cancelled',
    'status_updated', 'menu_synced', 'error'
  )),
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient querying (org + branch is standard; recent events first)
CREATE INDEX IF NOT EXISTS grab_sync_events_org_branch_created_idx
  ON public.grab_sync_events(organization_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS grab_sync_events_order_idx
  ON public.grab_sync_events(order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS grab_sync_events_type_idx
  ON public.grab_sync_events(event_type);

-- Enable RLS for grab_sync_events (read-only for authenticated users, write via admin/server)
ALTER TABLE public.grab_sync_events ENABLE ROW LEVEL SECURITY;

-- SELECT policy: allow manager/cashier/admin to view event logs
DROP POLICY IF EXISTS grab_sync_events_select ON public.grab_sync_events;
CREATE POLICY grab_sync_events_select ON public.grab_sync_events
  FOR SELECT TO authenticated
  USING (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'cashier'])
    AND public.has_branch_access(organization_id, branch_id)
  );

-- INSERT policy: allow authenticated users with manager+ role
-- (webhook handler will use admin client for bypass)
DROP POLICY IF EXISTS grab_sync_events_insert ON public.grab_sync_events;
CREATE POLICY grab_sync_events_insert ON public.grab_sync_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager'])
    AND public.has_branch_access(organization_id, branch_id)
  );

-- Prevent accidental updates/deletes on event log (append-only)
DROP POLICY IF EXISTS grab_sync_events_prevent_modify ON public.grab_sync_events;
CREATE POLICY grab_sync_events_prevent_modify ON public.grab_sync_events
  FOR UPDATE TO authenticated
  USING (false);

DROP POLICY IF EXISTS grab_sync_events_prevent_delete ON public.grab_sync_events;
CREATE POLICY grab_sync_events_prevent_delete ON public.grab_sync_events
  FOR DELETE TO authenticated
  USING (false);

-- ===== SEED GRAB MOCK SALES CHANNEL =====
-- Add "Grab (Mock)" as a delivery channel for all organizations
-- (Follows pattern from 0007_add_default_takeaway_channels.sql)
INSERT INTO public.sales_channels (organization_id, name, type, is_active)
SELECT o.id, 'Grab (Mock)'::text, 'delivery'::text, true
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sales_channels s
  WHERE s.organization_id = o.id
    AND LOWER(s.name) = LOWER('Grab (Mock)')
);
