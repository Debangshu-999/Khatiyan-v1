CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY,

    phone VARCHAR(15) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    role VARCHAR(20) NOT NULL,
    pin_hash TEXT NULL,

    is_active BOOLEAN NOT NULL,
    is_phone_verified BOOLEAN NOT NULL,
    credential_version INT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_phone_active
    ON auth.users (phone)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_users_role_active
    ON auth.users (role)
    WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS auth.otp_requests (
    id UUID PRIMARY KEY,

    phone VARCHAR(15) NOT NULL,
    purpose VARCHAR(30) NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INT NOT NULL,
    consumed_at TIMESTAMPTZ NULL,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_otp_requests_phone_purpose_created
    ON auth.otp_requests (phone, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_otp_requests_usable
    ON auth.otp_requests (phone, purpose, expires_at)
    WHERE consumed_at IS NULL;
