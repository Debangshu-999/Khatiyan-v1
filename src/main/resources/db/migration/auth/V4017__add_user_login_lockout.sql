ALTER TABLE auth.users
    ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN login_locked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN login_locked_at TIMESTAMPTZ NULL,
    ADD COLUMN last_failed_login_at TIMESTAMPTZ NULL,
    ADD COLUMN last_successful_login_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_users_login_locked
    ON auth.users (login_locked, login_locked_at)
    WHERE is_active = TRUE;

CREATE TABLE auth.login_attempts (
    id UUID PRIMARY KEY,
    phone VARCHAR(15) NOT NULL,
    ip_address VARCHAR(100),
    successful BOOLEAN NOT NULL,
    failure_reason VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_phone_created_at
    ON auth.login_attempts (phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_created_at
    ON auth.login_attempts (ip_address, created_at DESC)
    WHERE ip_address IS NOT NULL;

ALTER TABLE auth.otp_requests
    ADD COLUMN request_ip_address VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_otp_requests_ip_created
    ON auth.otp_requests (request_ip_address, created_at DESC)
    WHERE request_ip_address IS NOT NULL;
