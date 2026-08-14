ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE companion_profiles
  ADD COLUMN IF NOT EXISTS workspace_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
