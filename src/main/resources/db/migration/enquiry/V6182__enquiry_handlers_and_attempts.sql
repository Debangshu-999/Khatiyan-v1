-- Enquiries get a handler, and an answer becomes an attempt with an outcome.
--
-- Decided 2026-10-02 (docs/superpowers/specs/2026-09-30-leads-engine-design.md):
--   * One person handles an enquiry. How they are chosen is the property's
--     handler mode: first to respond (the default), the system in even turns,
--     or the owner assigning each one.
--   * Reaching out is an ATTEMPT. A call stays OPEN until the handler says
--     whether the enquirer responded. A chat message stays OPEN until the
--     enquirer replies, or the enquiry expires. The enquiry is answered only
--     when an attempt succeeds.
--   * An enquiry lives 30 days, not 7.

-- ---------------------------------------------------------------------------
-- The handler, and when the enquiry was actually answered.
-- ---------------------------------------------------------------------------
ALTER TABLE enquiry.enquiries
    ADD COLUMN handler_user_id UUID,
    ADD COLUMN handler_assigned_by VARCHAR(20),
    ADD COLUMN handler_assigned_by_user_id UUID,
    ADD COLUMN handler_assigned_at TIMESTAMPTZ,
    ADD COLUMN responded_at TIMESTAMPTZ;

ALTER TABLE enquiry.enquiries
    ADD CONSTRAINT chk_enquiries_handler_assigned_by
        CHECK (handler_assigned_by IS NULL
            OR handler_assigned_by IN ('FIRST_RESPONSE', 'SYSTEM', 'OWNER')),
    -- A handler always comes with how and when they got it.
    ADD CONSTRAINT chk_enquiries_handler_complete
        CHECK ((handler_user_id IS NULL AND handler_assigned_by IS NULL AND handler_assigned_at IS NULL)
            OR (handler_user_id IS NOT NULL AND handler_assigned_by IS NOT NULL AND handler_assigned_at IS NOT NULL));

COMMENT ON COLUMN enquiry.enquiries.handler_user_id
    IS 'auth.users.id of the owner or manager handling this enquiry. No FK: cross-module.';

-- "My enquiries": the ones one person handles on a property, newest first.
CREATE INDEX idx_enquiries_handler_property_created
    ON enquiry.enquiries (handler_user_id, property_id, created_at DESC)
    WHERE handler_user_id IS NOT NULL;

-- The daily reminder: open enquiries nobody has been given.
CREATE INDEX idx_enquiries_unassigned_open
    ON enquiry.enquiries (property_id)
    WHERE handler_user_id IS NULL AND status = 'NEW';

-- Answered rows were answered when their last response was recorded.
UPDATE enquiry.enquiries e
SET responded_at = COALESCE(
        (SELECT MAX(r.created_at) FROM enquiry.enquiry_responses r WHERE r.enquiry_id = e.id),
        e.updated_at)
WHERE e.status = 'RESPONDED';

-- Open enquiries get the new lifetime, counted from when they were asked.
UPDATE enquiry.enquiries
SET expires_at = created_at + INTERVAL '30 days'
WHERE status = 'NEW';

-- ---------------------------------------------------------------------------
-- A response row becomes an attempt.
-- ---------------------------------------------------------------------------
ALTER TABLE enquiry.enquiry_responses
    ADD COLUMN outcome VARCHAR(20),
    ADD COLUMN settled_at TIMESTAMPTZ;

-- Every row written before this marked its enquiry answered on the spot, so
-- each one was, by the rule of its day, a success.
UPDATE enquiry.enquiry_responses
SET outcome = 'SUCCEEDED',
    settled_at = created_at
WHERE outcome IS NULL;

ALTER TABLE enquiry.enquiry_responses
    ALTER COLUMN outcome SET NOT NULL,
    ADD CONSTRAINT chk_enquiry_responses_outcome
        CHECK (outcome IN ('OPEN', 'SUCCEEDED', 'FAILED')),
    -- Settled means it has a time, open means it has none.
    ADD CONSTRAINT chk_enquiry_responses_settled
        CHECK ((outcome = 'OPEN') = (settled_at IS NULL));

-- One call waiting to be settled per enquiry. Two managers tapping Call at the
-- same moment cannot both leave one open.
CREATE UNIQUE INDEX uq_enquiry_responses_open_call
    ON enquiry.enquiry_responses (enquiry_id)
    WHERE outcome = 'OPEN' AND channel = 'CALL_BACK';

-- One chat waiting for a reply per enquiry. It is a separate index on purpose:
-- the two channels are independent, and a message nobody answered must never
-- stop the handler from calling.
CREATE UNIQUE INDEX uq_enquiry_responses_open_chat
    ON enquiry.enquiry_responses (enquiry_id)
    WHERE outcome = 'OPEN' AND channel = 'CHAT';

-- ---------------------------------------------------------------------------
-- How a property chooses the handler. No row means first to respond.
-- ---------------------------------------------------------------------------
CREATE TABLE enquiry.enquiry_handler_settings (
    id UUID NOT NULL,
    property_id UUID NOT NULL,
    mode VARCHAR(20) NOT NULL,
    include_owner BOOLEAN NOT NULL DEFAULT false,
    -- Who the system gave the last enquiry to, so the next goes to whoever
    -- follows them. Null until the first turn.
    last_assigned_user_id UUID,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_enquiry_handler_settings PRIMARY KEY (id),
    CONSTRAINT uq_enquiry_handler_settings_property UNIQUE (property_id),
    CONSTRAINT chk_enquiry_handler_settings_mode
        CHECK (mode IN ('FIRST_RESPONSE', 'SYSTEM_TURNS', 'OWNER_ASSIGNS'))
);

COMMENT ON TABLE enquiry.enquiry_handler_settings
    IS 'One row per property that has chosen a handler mode. Absent means FIRST_RESPONSE.';
