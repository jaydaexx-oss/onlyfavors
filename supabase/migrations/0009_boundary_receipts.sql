-- Boundary Receipt: a snapshot both people sign. Clauses do not change after
-- the first signature. Changing a booking means a new request.

CREATE TABLE IF NOT EXISTS boundary_receipts (
  id text PRIMARY KEY,
  booking_id text NOT NULL UNIQUE REFERENCES bookings(id),
  activity text NOT NULL,
  venue_name text NOT NULL,
  date text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  duration_hours numeric NOT NULL,
  clauses jsonb NOT NULL DEFAULT '[]'::jsonb,
  customer_agreed_at timestamptz,
  companion_agreed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE boundary_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE boundary_receipts FROM PUBLIC;
REVOKE ALL ON TABLE boundary_receipts FROM anon, authenticated;
