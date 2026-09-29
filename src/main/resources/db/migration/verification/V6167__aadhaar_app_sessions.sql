-- Aadhaar checks move from an OTP to the Aadhaar App (offline verification,
-- 2026-09-27). The tenant is sent into the Aadhaar App to consent, and the
-- provider posts the result back to us, so an attempt is now a session that
-- waits for a callback rather than a code that waits to be typed.
--
-- Spec: docs/superpowers/specs/2026-09-27-aadhaar-app-ovse-design.md

ALTER TABLE verification.verification_attempts
    -- The provider's id for the session, used to ask them about it when a
    -- callback has not arrived.
    ADD COLUMN provider_session_id VARCHAR(120),
    ADD COLUMN session_expires_at TIMESTAMPTZ,
    -- SHA-256 of the one-time token in the callback URL. The token is what
    -- makes a callback ours; only its hash is kept, so a leaked table cannot
    -- be used to post a fake result.
    ADD COLUMN callback_token_hash VARCHAR(64),
    -- Where the app sends the tenant: the Aadhaar App intent link. Kept so a
    -- tenant who comes back to the screen can reopen it.
    ADD COLUMN intent_url TEXT,
    -- Whether the Aadhaar App's own face check passed. Null when not run.
    ADD COLUMN face_matched BOOLEAN;

CREATE UNIQUE INDEX verification_attempts_callback_token_idx
    ON verification.verification_attempts (callback_token_hash)
    WHERE callback_token_hash IS NOT NULL;

ALTER TABLE verification.verification_grants
    -- The gender on the credential, adopted and locked on the account.
    ADD COLUMN verified_gender VARCHAR(20),
    ADD COLUMN face_matched BOOLEAN;
