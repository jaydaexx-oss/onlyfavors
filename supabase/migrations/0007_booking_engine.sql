-- Custom booking engine: timezone-aware ranges, DB-level overlap exclusion,
-- unpaid hold expiry, and PostgREST lockout for private booking data.
-- The Express API uses the table owner (DATABASE_URL) and bypasses RLS.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id text;

-- Backfill America/Chicago instants from the stored wall clock.
UPDATE bookings
SET starts_at = ((date::date + start_time::time) AT TIME ZONE 'America/Chicago')
WHERE starts_at IS NULL
  AND date ~ '^\d{4}-\d{2}-\d{2}$'
  AND start_time ~ '^\d{2}:\d{2}';

UPDATE bookings
SET ends_at = starts_at + (duration_hours * interval '1 hour')
WHERE ends_at IS NULL
  AND starts_at IS NOT NULL
  AND duration_hours IS NOT NULL;

UPDATE bookings
SET hold_expires_at = created_at + interval '10 minutes'
WHERE status = 'requested'
  AND hold_expires_at IS NULL
  AND deposit_paid_at IS NULL;

UPDATE bookings
SET status = 'expired',
    updated_at = now(),
    hold_expires_at = NULL
WHERE status = 'requested'
  AND deposit_paid_at IS NULL
  AND hold_expires_at IS NOT NULL
  AND hold_expires_at < now();

-- Occupied slots: unpaid holds, deposit-paid requests, confirmed, authorized.
-- Expired/cancelled/completed rows drop out of the constraint via status.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_companion_slot_excl;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_companion_slot_excl
  EXCLUDE USING gist (
    companion_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (
    status IN ('requested', 'deposit_paid', 'confirmed', 'authorized')
    AND starts_at IS NOT NULL
    AND ends_at IS NOT NULL
  );

CREATE OR REPLACE FUNCTION expire_unpaid_booking_holds() RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  n integer;
BEGIN
  WITH expired AS (
    UPDATE bookings
    SET status = 'expired',
        updated_at = now(),
        hold_expires_at = NULL
    WHERE status = 'requested'
      AND deposit_paid_at IS NULL
      AND hold_expires_at IS NOT NULL
      AND hold_expires_at < now()
    RETURNING id
  )
  SELECT count(*)::integer INTO n FROM expired;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION expire_unpaid_booking_holds() IS
  'Release unpaid 10-minute reservation holds. Optional: SELECT cron.schedule(''expire-booking-holds'', ''* * * * *'', $$SELECT expire_unpaid_booking_holds()$$);';

-- Exact meeting pins are never readable via PostgREST.
ALTER TABLE private.exact_locations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  REVOKE ALL ON TABLE bookings FROM PUBLIC;
  REVOKE ALL ON TABLE messages FROM PUBLIC;
  REVOKE ALL ON TABLE incident_reports FROM PUBLIC;
  REVOKE ALL ON TABLE check_ins FROM PUBLIC;
  REVOKE ALL ON TABLE trusted_contacts FROM PUBLIC;
  REVOKE ALL ON TABLE private.exact_locations FROM PUBLIC;
EXCEPTION
  WHEN undefined_table THEN NULL;
END;
$$;

DO $$
BEGIN
  REVOKE ALL ON TABLE bookings FROM anon, authenticated;
  REVOKE ALL ON TABLE messages FROM anon, authenticated;
  REVOKE ALL ON TABLE incident_reports FROM anon, authenticated;
  REVOKE ALL ON TABLE check_ins FROM anon, authenticated;
  REVOKE ALL ON TABLE trusted_contacts FROM anon, authenticated;
  REVOKE ALL ON TABLE private.exact_locations FROM anon, authenticated;
EXCEPTION
  WHEN undefined_object THEN NULL;
END;
$$;
