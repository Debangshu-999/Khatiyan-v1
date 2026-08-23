-- One row per issued access token, so a person can see where they are signed in
-- and end any one of those sessions without ending the others.
--
-- credential_version already existed as a kill switch, but it is a single
-- counter on the user: bumping it drops EVERY token including the caller's own.
-- That serves "PIN changed, sign everything out" and cannot express "sign out
-- that tablet". Per-session rows are what make one device revocable.
CREATE TABLE IF NOT EXISTS auth.user_sessions (
    id            UUID         PRIMARY KEY,
    user_id       UUID         NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    -- The token's jti claim. Unique because a token maps to exactly one session,
    -- and the filter looks a session up by it on revocation checks.
    jti           UUID         NOT NULL UNIQUE,
    -- What the person will recognise in the list ("Pixel 8", "Chrome on Windows").
    -- Client-supplied and therefore untrusted: display only, never a decision.
    device_label  VARCHAR(120) NULL,
    platform      VARCHAR(20)  NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- Throttled to roughly one write every few minutes, NOT per request: this is
    -- a hot row and a write on every authenticated call would be the single most
    -- expensive thing about being signed in.
    last_seen_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ  NOT NULL,
    revoked_at    TIMESTAMPTZ  NULL
);

-- The list query: a user's sessions, newest first.
CREATE INDEX IF NOT EXISTS ix_user_sessions_user
    ON auth.user_sessions (user_id, created_at DESC);

-- Sweeping sessions whose token has expired anyway.
CREATE INDEX IF NOT EXISTS ix_user_sessions_expires_at
    ON auth.user_sessions (expires_at)
    WHERE revoked_at IS NULL;
