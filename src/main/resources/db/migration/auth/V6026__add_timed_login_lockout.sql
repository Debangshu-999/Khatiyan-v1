ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_users_login_locked_until
    ON auth.users (login_locked_until)
    WHERE is_active = TRUE AND login_locked = TRUE;
