-- Every code request, for any number or email address, account or not (user,
-- 2026-11-14). The resend schedule reads the next allowed send from here: one
-- code every 30 seconds for the first 20 in a day, then the gap doubles for
-- every further 10. Counted for numbers with no account too, so the waits never
-- tell a real account from a missing one. Rows older than two days are purged.

CREATE TABLE IF NOT EXISTS auth.otp_send_attempts (
    id BIGSERIAL PRIMARY KEY,
    identifier VARCHAR(320) NOT NULL,
    scope VARCHAR(40) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS otp_send_attempts_identifier_scope_created
    ON auth.otp_send_attempts (identifier, scope, created_at DESC);

CREATE INDEX IF NOT EXISTS otp_send_attempts_created
    ON auth.otp_send_attempts (created_at);
