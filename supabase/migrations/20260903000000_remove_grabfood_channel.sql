-- =============================================================
-- Migration: 20260903000000_remove_grabfood_channel.sql
-- Purpose: Remove redundant 'GrabFood' channel and consolidate into 'Grab (Mock)'
-- =============================================================

-- 1. Ensure all organizations have 'Grab (Mock)' sales channel
INSERT INTO public.sales_channels (organization_id, name, type, is_active)
SELECT o.id, 'Grab (Mock)'::text, 'delivery'::text, true
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sales_channels s
  WHERE s.organization_id = o.id
    AND LOWER(s.name) = LOWER('Grab (Mock)')
);

-- 2. Reassign orders pointing to GrabFood to the org's Grab (Mock)
UPDATE public.orders o
SET sales_channel_id = mock.id
FROM public.sales_channels food
JOIN public.sales_channels mock
  ON mock.organization_id = food.organization_id
  AND LOWER(mock.name) = LOWER('Grab (Mock)')
WHERE o.sales_channel_id = food.id
  AND LOWER(food.name) = LOWER('GrabFood');

-- 3. Reassign default takeaway channel in organization_settings
UPDATE public.organization_settings ops
SET default_takeaway_channel_id = mock.id
FROM public.sales_channels food
JOIN public.sales_channels mock
  ON mock.organization_id = food.organization_id
  AND LOWER(mock.name) = LOWER('Grab (Mock)')
WHERE ops.default_takeaway_channel_id = food.id
  AND LOWER(food.name) = LOWER('GrabFood');

-- 4. Delete all 'GrabFood' sales channels
DELETE FROM public.sales_channels
WHERE LOWER(name) = LOWER('GrabFood');

