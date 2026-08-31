-- What somebody declared, when, from where, and on what.
--
-- A boolean on a business row is enough to run the product and not enough to
-- defend it. "The administrator changed the 0 to a 1 afterwards" is an argument
-- a column cannot answer, because a column has no memory of how it got its
-- value. These rows do: each one carries the exact words shown, who was signed
-- in, from which address and device, and a hash over all of it.
--
-- One table for every kind of declaration rather than columns bolted onto each
-- business table. The evidential shape is identical whatever is being attested,
-- and keeping it in one place is what will let the hash chain and the external
-- anchor hook into a single stream later.
CREATE TABLE compliance.attestations (
    id                  UUID PRIMARY KEY,

    -- What was declared. Widened by adding values, never by reusing one.
    kind                VARCHAR(48)  NOT NULL,

    -- What it was declared ABOUT: a tenancy, an agreement, later a user for the
    -- app-wide terms. Untyped on purpose — this table must not gain a foreign
    -- key into another module's schema.
    subject_id          UUID         NOT NULL,

    -- Who made the declaration, and under which signed-in session. The session
    -- is what ties the act to a device list the person can see for themselves.
    actor_user_id       UUID         NOT NULL,
    session_jti         UUID         NULL,

    occurred_at         TIMESTAMPTZ  NOT NULL,

    -- Resolved through the trusted-proxy rules, not read from a header. An
    -- address the visitor chose would be worse than none.
    client_ip           VARCHAR(64)  NULL,

    -- The device as it described itself. A claim, not a fact — but a consistent
    -- claim across a person's history is itself evidence, and an inconsistent
    -- one is worth noticing.
    device_brand        VARCHAR(64)  NULL,
    device_model        VARCHAR(96)  NULL,
    device_os_version   VARCHAR(48)  NULL,
    device_os_build     VARCHAR(96)  NULL,
    app_version         VARCHAR(32)  NULL,
    app_install_id      VARCHAR(64)  NULL,
    platform            VARCHAR(24)  NULL,

    -- The EXACT words on screen, and which revision of them. Without this the
    -- record proves somebody pressed a button and not what the button said, and
    -- the wording will certainly be revised.
    statement_key       VARCHAR(64)  NOT NULL,
    statement_version   INTEGER      NOT NULL,
    statement_text      TEXT         NOT NULL,

    -- A hash of the thing being agreed to, where one exists: the agreement's
    -- own content hash. Null for a declaration that is only about itself.
    subject_hash        VARCHAR(128) NULL,

    -- Free-form, hashed with everything else. Holds the declaration's own
    -- particulars — the ID document type and its last four digits, for one.
    details             JSONB        NOT NULL DEFAULT '{}'::jsonb,

    -- A second factor, where the act warranted one. The challenge is bound to
    -- subject_hash when it is issued, so this proves acceptance OF THAT TEXT
    -- rather than merely that a person was reachable.
    otp_verified        BOOLEAN      NOT NULL DEFAULT FALSE,
    otp_verified_at     TIMESTAMPTZ  NULL,
    otp_channel         VARCHAR(24)  NULL,
    otp_destination     VARCHAR(32)  NULL,

    -- SHA-256 over the canonical JSON of every field above. Recomputable from
    -- the row, so a later mismatch localises the tampering to this row.
    record_hash         VARCHAR(128) NOT NULL,

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_attestations_kind CHECK (kind IN (
        'TENANCY_AGREEMENT_ACCEPTANCE',
        'TENANT_ID_DECLARATION'
    )),
    CONSTRAINT ck_attestations_otp CHECK (
        (otp_verified = FALSE AND otp_verified_at IS NULL)
        OR (otp_verified = TRUE AND otp_verified_at IS NOT NULL)
    )
);

CREATE INDEX ix_attestations_subject ON compliance.attestations (subject_id, kind);
CREATE INDEX ix_attestations_actor ON compliance.attestations (actor_user_id, occurred_at DESC);

-- Append-only, enforced by the database rather than by convention.
--
-- The hash makes tampering DETECTABLE; this makes it fail. Both are needed: a
-- hash the application can recompute after an UPDATE proves nothing, because
-- whoever changed the row could change the hash in the same statement.
--
-- Deliberately a trigger and not merely a revoked grant. Grants are easy to
-- restore quietly and are invisible in the schema; a trigger travels with the
-- table and is in the migration history for anyone auditing it later.
CREATE OR REPLACE FUNCTION compliance.attestations_are_append_only()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'compliance.attestations is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_attestations_no_update
    BEFORE UPDATE OR DELETE ON compliance.attestations
    FOR EACH ROW EXECUTE FUNCTION compliance.attestations_are_append_only();
