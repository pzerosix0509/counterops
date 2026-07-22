ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS bank_code text,
  ADD COLUMN IF NOT EXISTS bank_account_number text;
