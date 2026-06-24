ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS email_verification_token_hash VARCHAR(64) NULL,
    ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMP WITH TIME ZONE NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_verification_token
    ON auth.users (email_verification_token_hash)
    WHERE email_verification_token_hash IS NOT NULL;