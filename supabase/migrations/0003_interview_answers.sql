ALTER TABLE companion_profiles
  ADD COLUMN IF NOT EXISTS interview_answers jsonb NOT NULL DEFAULT '[]'::jsonb;
