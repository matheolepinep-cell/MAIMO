-- Track whether an invited user has defined their password
-- Default true for existing users (they registered normally with a password).
-- Set to false when sending invites — flipped to true after /set-password.
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_set_password BOOLEAN NOT NULL DEFAULT true;
