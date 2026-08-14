-- OnlyFavors production schema
-- Apply against the connected Postgres / Supabase database.
-- RLS protects PostgREST exposure. The API uses DATABASE_URL (table owner).

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY,
  email text NOT NULL,
  display_name text,
  age_confirmed_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  risk_level text NOT NULL DEFAULT 'standard',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_idx ON accounts (email);

CREATE TABLE IF NOT EXISTS account_roles (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id),
  role text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by text
);
CREATE UNIQUE INDEX IF NOT EXISTS account_roles_account_role_idx ON account_roles (account_id, role);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id text PRIMARY KEY,
  email text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'login',
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id),
  token_hash text NOT NULL,
  revoked_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_settings (
  id text PRIMARY KEY DEFAULT 'default',
  platform_fee_percent integer NOT NULL DEFAULT 20,
  access_fee_cents integer NOT NULL DEFAULT 0,
  access_fee_enabled boolean NOT NULL DEFAULT false,
  access_fee_label text NOT NULL DEFAULT 'Messaging access',
  announcement_message text NOT NULL DEFAULT '',
  announcement_kind text NOT NULL DEFAULT 'info',
  announcement_active boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companion_profiles (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id),
  display_name text NOT NULL,
  city text NOT NULL,
  service_area text NOT NULL,
  activities jsonb NOT NULL DEFAULT '[]'::jsonb,
  languages jsonb NOT NULL DEFAULT '[]'::jsonb,
  hourly_rate integer NOT NULL,
  day_rate integer,
  response_time text NOT NULL DEFAULT 'Usually within a day',
  rating numeric NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  verified boolean NOT NULL DEFAULT false,
  approved boolean NOT NULL DEFAULT false,
  instant_book boolean NOT NULL DEFAULT false,
  paused boolean NOT NULL DEFAULT false,
  available_today boolean NOT NULL DEFAULT false,
  biography text,
  boundaries jsonb NOT NULL DEFAULT '[]'::jsonb,
  photo_url text,
  stripe_account_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companion_applications (
  id text PRIMARY KEY,
  account_id text REFERENCES accounts(id),
  display_name text NOT NULL,
  email text NOT NULL,
  city text NOT NULL,
  bio text NOT NULL,
  activities jsonb NOT NULL DEFAULT '[]'::jsonb,
  languages jsonb NOT NULL DEFAULT '["English"]'::jsonb,
  hourly_rate integer NOT NULL DEFAULT 60,
  status text NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_areas (
  id text PRIMARY KEY,
  companion_id text NOT NULL REFERENCES companion_profiles(id),
  label text NOT NULL,
  city text NOT NULL,
  radius_km integer NOT NULL DEFAULT 8,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS availability_windows (
  id text PRIMARY KEY,
  companion_id text NOT NULL REFERENCES companion_profiles(id),
  weekday integer NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safespots (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  city text NOT NULL,
  address_hint text NOT NULL,
  open_late boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safespot_applications (
  id text PRIMARY KEY,
  name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  type text NOT NULL DEFAULT 'other',
  contact_email text NOT NULL,
  contact_name text,
  description text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_companions (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id),
  companion_id text NOT NULL REFERENCES companion_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookings (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  companion_id text NOT NULL,
  activity text NOT NULL,
  date text NOT NULL,
  start_time text NOT NULL,
  duration_hours numeric NOT NULL,
  safe_spot_id text,
  status text NOT NULL DEFAULT 'draft',
  subtotal_cents integer NOT NULL,
  customer_fee_cents integer NOT NULL,
  total_cents integer NOT NULL,
  companion_payout_cents integer NOT NULL,
  platform_revenue_cents integer NOT NULL,
  deposit_cents integer NOT NULL DEFAULT 1000,
  deposit_payment_intent_id text,
  deposit_paid_at timestamptz,
  full_payment_intent_id text,
  authorized_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS favor_requests (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  companion_id text NOT NULL,
  activity text NOT NULL,
  preferred_date text NOT NULL,
  preferred_duration_hours numeric NOT NULL,
  location_type text,
  accessibility_needs text,
  dress_code text,
  additional_questions text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  booking_id text NOT NULL,
  sender_id text NOT NULL,
  sender_role text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trusted_contacts (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id),
  name text NOT NULL,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS check_ins (
  id text PRIMARY KEY,
  booking_id text NOT NULL REFERENCES bookings(id),
  account_id text REFERENCES accounts(id),
  venue text,
  kind text NOT NULL DEFAULT 'arrival',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incident_reports (
  id text PRIMARY KEY,
  reporter_id text REFERENCES accounts(id),
  subject_account_id text,
  companion_id text,
  booking_id text,
  report_type text NOT NULL,
  detail text NOT NULL,
  urgent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open',
  risk_level text NOT NULL DEFAULT 'standard',
  resolution_note text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id text PRIMARY KEY,
  booking_id text NOT NULL REFERENCES bookings(id),
  companion_id text NOT NULL,
  customer_id text NOT NULL,
  rating integer NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id),
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  href text NOT NULL DEFAULT '/',
  audience text NOT NULL DEFAULT 'customer',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id text PRIMARY KEY,
  actor_id text NOT NULL,
  action text NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private.exact_locations (
  id text PRIMARY KEY,
  booking_id text NOT NULL,
  ciphertext text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC;

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE safespots ENABLE ROW LEVEL SECURITY;
ALTER TABLE safespot_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_companions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE favor_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE trusted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companion_profiles_public_read ON companion_profiles;
CREATE POLICY companion_profiles_public_read ON companion_profiles
  FOR SELECT USING (approved = true AND paused = false);

DROP POLICY IF EXISTS safespots_public_read ON safespots;
CREATE POLICY safespots_public_read ON safespots
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS reviews_public_read ON reviews;
CREATE POLICY reviews_public_read ON reviews
  FOR SELECT USING (true);

DROP POLICY IF EXISTS platform_settings_public_read ON platform_settings;
CREATE POLICY platform_settings_public_read ON platform_settings
  FOR SELECT USING (id = 'default');

INSERT INTO platform_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;
