-- Account lifecycle: ban and reversible deactivate. Sessions stay revocable.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS banned_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

ALTER TABLE companion_applications
  ALTER COLUMN status SET DEFAULT 'pending';
