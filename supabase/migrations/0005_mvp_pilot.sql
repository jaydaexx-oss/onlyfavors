-- Pilot freeze: booking events, blocks, identity, payout holds, timezone, deletion.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE companion_profiles
  ADD COLUMN IF NOT EXISTS identity_status text NOT NULL DEFAULT 'unsubmitted',
  ADD COLUMN IF NOT EXISTS payouts_held boolean NOT NULL DEFAULT false;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Chicago',
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_held boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE TABLE IF NOT EXISTS booking_events (
  id text PRIMARY KEY,
  booking_id text NOT NULL REFERENCES bookings(id),
  from_status text,
  to_status text NOT NULL,
  actor_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_events_booking_idx ON booking_events (booking_id, created_at);

CREATE TABLE IF NOT EXISTS account_blocks (
  id text PRIMARY KEY,
  blocker_id text NOT NULL REFERENCES accounts(id),
  blocked_id text NOT NULL REFERENCES accounts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS account_blocks_pair_idx ON account_blocks (blocker_id, blocked_id);
