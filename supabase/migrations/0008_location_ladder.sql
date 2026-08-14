-- Location ladder: ordinary sharing can stop immediately; ciphertext stays
-- readable for 24 hours for emergency, then is deleted. Public APIs still
-- never return companion live pins.

ALTER TABLE private.exact_locations
  ADD COLUMN IF NOT EXISTS sharing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS account_id text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'checkin';

CREATE TABLE IF NOT EXISTS location_share_links (
  id text PRIMARY KEY,
  booking_id text NOT NULL REFERENCES bookings(id),
  account_id text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE location_share_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE location_share_links FROM PUBLIC;
REVOKE ALL ON TABLE location_share_links FROM anon, authenticated;
