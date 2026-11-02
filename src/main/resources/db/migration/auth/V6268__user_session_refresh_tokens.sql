-- Short access tokens, renewed by a refresh token held per session (user, 2026-11-02).
--
-- A session is now one device's sign-in, kept across many access tokens, which all
-- carry its jti. expires_at therefore means the session's end, moved on by each
-- renewal, and no longer one token's.
--
-- Only hashes are stored: a copy of this table cannot be used to sign in.
-- The previous hash is what tells a retry after a lost reply from a stolen token
-- being replayed: see UserSessionService.rotate.
ALTER TABLE auth.user_sessions
    ADD COLUMN refresh_token_hash VARCHAR(64) NULL,
    ADD COLUMN previous_refresh_token_hash VARCHAR(64) NULL,
    ADD COLUMN previous_refresh_rotated_at TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX uq_user_sessions_refresh_token_hash
    ON auth.user_sessions (refresh_token_hash)
    WHERE refresh_token_hash IS NOT NULL;

CREATE INDEX ix_user_sessions_previous_refresh_token_hash
    ON auth.user_sessions (previous_refresh_token_hash)
    WHERE previous_refresh_token_hash IS NOT NULL;
