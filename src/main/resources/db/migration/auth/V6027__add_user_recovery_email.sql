ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS email VARCHAR(254) NULL,
    ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_active
    ON auth.users (LOWER(email))
    WHERE is_active = TRUE AND email IS NOT NULL;
