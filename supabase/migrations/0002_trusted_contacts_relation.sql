CREATE UNIQUE INDEX IF NOT EXISTS saved_companions_account_companion_idx
  ON saved_companions (account_id, companion_id);
