-- The record of every question Khatiyan asks a language model.
--
-- This is the only part of the product that sends anything to a third party, so
-- there has to be a durable answer to "what did we send, to whom, and what did
-- it cost" that does not depend on a log file still existing.
--
-- WHAT IS DELIBERATELY ABSENT: the prompt and the response. Not an oversight —
-- a smart-search prompt contains whatever a tenant typed, and an insight prompt
-- is built from their property's figures. Storing either would turn an audit
-- table into a second copy of the data the redaction rules exist to protect.
-- Everything here is metadata about the call, and the snapshot_hash is how a
-- generated insight is tied back to the figures it came from without keeping
-- those figures twice.
CREATE SCHEMA IF NOT EXISTS intelligence;

CREATE TABLE intelligence.ai_invocation (
    id                UUID PRIMARY KEY,

    -- Which feature asked, and on whose behalf. actor_user_id is null for
    -- scheduled work that no person triggered.
    capability        VARCHAR(40)  NOT NULL,
    actor_user_id     UUID,
    actor_role        VARCHAR(30),
    property_id       UUID,

    -- Who answered, and as what. Model IDs live in configuration, so this is
    -- the only place that records which one actually served a given call.
    provider          VARCHAR(20)  NOT NULL,
    model             VARCHAR(100) NOT NULL,
    fallback_used     BOOLEAN      NOT NULL DEFAULT FALSE,

    -- What shape the question and answer were. A prompt or schema change is
    -- gated on the golden set, and these are how a bad batch is traced to the
    -- version that produced it.
    prompt_version    VARCHAR(20),
    schema_version    VARCHAR(20),
    snapshot_hash     VARCHAR(64),

    -- What it cost. Nullable because a refusal or a cache hit costs nothing,
    -- and a provider error may return no usage at all.
    input_tokens      INTEGER,
    output_tokens     INTEGER,
    latency_ms        INTEGER      NOT NULL,
    cache_hit         BOOLEAN      NOT NULL DEFAULT FALSE,

    -- How it ended. A refusal is as much a fact as an answer: budget refusals
    -- are the signal that the free tier is too small, and validation failures
    -- are the signal that a prompt or model has drifted.
    outcome           VARCHAR(24)  NOT NULL,
    error_code        VARCHAR(60),
    trace_id          VARCHAR(64),

    created_at        TIMESTAMPTZ  NOT NULL,
    updated_at        TIMESTAMPTZ  NOT NULL,

    CONSTRAINT chk_ai_invocation_tokens
        CHECK ((input_tokens IS NULL OR input_tokens >= 0)
           AND (output_tokens IS NULL OR output_tokens >= 0)),
    CONSTRAINT chk_ai_invocation_latency CHECK (latency_ms >= 0)
);

-- Reading the recent history of one capability is the common question, whether
-- that is "how much did search cost today" or "when did validation start
-- failing".
CREATE INDEX idx_ai_invocation_capability_time
    ON intelligence.ai_invocation (capability, created_at DESC);

-- Per-property, for the owner-facing usage view in Phase 1B.
CREATE INDEX idx_ai_invocation_property_time
    ON intelligence.ai_invocation (property_id, created_at DESC)
    WHERE property_id IS NOT NULL;
