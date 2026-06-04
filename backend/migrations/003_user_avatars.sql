ALTER TABLE app_users
  ADD COLUMN avatar_data BYTEA,
  ADD COLUMN avatar_mime VARCHAR(30);

ALTER TABLE app_users
  ADD CONSTRAINT app_users_avatar_pair_check
  CHECK (
    (avatar_data IS NULL AND avatar_mime IS NULL)
    OR
    (avatar_data IS NOT NULL AND avatar_mime IS NOT NULL)
  );
