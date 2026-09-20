-- Tenant identity verification: what an owner ordered, and what a tenant did
-- about it.
--
-- Two tables and not one. A GRANT is the owner's decision — this tenancy needs
-- an Aadhaar check and the tenant gets three tries. An ATTEMPT is one run at it
-- by the tenant, and one line on the owner's bill. Folding them together would
-- mean either losing the history of failed tries or re-deciding the grant every
-- time somebody mistypes an OTP.
CREATE SCHEMA IF NOT EXISTS verification;

CREATE TABLE verification.verification_grants (
    id UUID PRIMARY KEY,
    tenancy_id UUID NOT NULL,
    -- Who pays. Denormalised from the tenancy on purpose: a grant outlives the
    -- lookup path to its property, and the ledger has to name a payer years
    -- later without reassembling three joins.
    owner_user_id UUID NOT NULL,
    property_id UUID NOT NULL,
    service_code VARCHAR(40) NOT NULL,
    attempts_granted INT NOT NULL,
    attempts_used INT NOT NULL DEFAULT 0,
    status VARCHAR(24) NOT NULL,

    -- The result, kept deliberately thin. Never the Aadhaar number, never the
    -- XML, never the photo, never the raw provider response: a masked fragment
    -- and whether the name matched is all that survives a check, and all any
    -- screen is allowed to show.
    verified_at TIMESTAMPTZ,
    verified_name VARCHAR(160),
    verified_dob DATE,
    masked_id_last_four VARCHAR(4),
    name_match_score NUMERIC(4, 3),
    name_matched BOOLEAN,

    created_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT verification_grants_attempts_granted_positive CHECK (attempts_granted > 0),
    CONSTRAINT verification_grants_attempts_used_sane CHECK (attempts_used >= 0),
    -- One grant per service per tenancy. Ordering the same check twice is an
    -- accident with a price attached, so the database refuses it rather than
    -- trusting every caller to look first.
    CONSTRAINT verification_grants_one_per_service UNIQUE (tenancy_id, service_code)
);

CREATE INDEX verification_grants_tenancy_idx ON verification.verification_grants (tenancy_id);
CREATE INDEX verification_grants_owner_idx ON verification.verification_grants (owner_user_id);
-- The exposure guard sums unused attempts across an owner, so it reads by owner
-- and status on every order.
CREATE INDEX verification_grants_owner_status_idx ON verification.verification_grants (owner_user_id, status);

CREATE TABLE verification.verification_attempts (
    id UUID PRIMARY KEY,
    grant_id UUID NOT NULL REFERENCES verification.verification_grants (id) ON DELETE CASCADE,
    status VARCHAR(24) NOT NULL,

    -- Our id for this attempt at the provider, sent as their reference_id, and
    -- theirs for the same thing. Both are kept: ours is how we find the attempt
    -- when they call back, theirs is what we quote in a support ticket.
    provider_reference VARCHAR(64) NOT NULL,
    provider_transaction_id VARCHAR(120),
    -- Last three digits of the Aadhaar-linked mobile, which is all the provider
    -- returns and all the tenant needs to know which phone to check.
    linked_mobile_hint VARCHAR(8),

    -- What this attempt cost when it ran. Read from configuration at the time,
    -- then frozen: a price change must not make last month's charge look wrong.
    price_paise BIGINT NOT NULL,
    charged_at TIMESTAMPTZ,

    failure_reason VARCHAR(200),
    otp_expires_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT verification_attempts_price_sane CHECK (price_paise >= 0),
    CONSTRAINT verification_attempts_provider_reference_unique UNIQUE (provider_reference)
);

CREATE INDEX verification_attempts_grant_idx ON verification.verification_attempts (grant_id);
-- The expiry sweep looks for attempts left waiting on an OTP that never came.
CREATE INDEX verification_attempts_open_idx
    ON verification.verification_attempts (status, otp_expires_at)
    WHERE completed_at IS NULL;
