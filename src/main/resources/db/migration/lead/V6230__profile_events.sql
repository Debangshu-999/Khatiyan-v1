-- What people do on a property's profile, as an append-only event log
-- (2026-10-18). The listing funnel starts here: who opened the profile, how
-- long they stayed, and whether they tapped to call or email. Everything after
-- that (enquiry, answer, visit, booking, move-in) is already on lead.leads.
--
-- Shaped like a modern analytics pipeline's raw log: one row per event, the
-- app's own event id as the key so a resent batch is ignored, the time it
-- happened on the phone (clock-corrected) and the time the server got it.
-- Rows are never edited and never cleared: the owner keeps their listing's
-- history since the property was created.

CREATE TABLE lead.profile_events (
    -- Made by the app. A batch sent twice lands once.
    id UUID PRIMARY KEY,
    event_name VARCHAR(30) NOT NULL,
    schema_version SMALLINT NOT NULL,
    user_id UUID NOT NULL,
    property_id UUID NOT NULL,
    -- Pairs an open with its close, so a close always finds its view.
    view_id UUID NOT NULL,
    -- When it happened, corrected for the phone's clock: the server's receive
    -- time less how long the app held the event.
    occurred_at TIMESTAMPTZ NOT NULL,
    client_occurred_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- The property's own owner or a manager of it. Kept, never counted.
    internal BOOLEAN NOT NULL DEFAULT FALSE,
    -- Where the profile was opened from: SEARCH, SMART_SEARCH, MAP, LINK, OTHER.
    source VARCHAR(20),
    -- Time on the profile while the app was in front, on a close.
    duration_ms BIGINT,
    -- CALL or EMAIL, on a contact tap.
    channel VARCHAR(10),
    app_version VARCHAR(40),
    platform VARCHAR(20),
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT chk_profile_events_name
        CHECK (event_name IN ('PROFILE_OPENED', 'PROFILE_CLOSED', 'CONTACT_TAPPED')),
    CONSTRAINT chk_profile_events_duration
        CHECK ((event_name = 'PROFILE_CLOSED') = (duration_ms IS NOT NULL) AND (duration_ms IS NULL OR duration_ms >= 0)),
    CONSTRAINT chk_profile_events_channel
        CHECK ((event_name = 'CONTACT_TAPPED') = (channel IS NOT NULL)
            AND (channel IS NULL OR channel IN ('CALL', 'EMAIL')))
);

-- The funnel reads one property's events in a period.
CREATE INDEX idx_profile_events_property_occurred
    ON lead.profile_events (property_id, occurred_at)
    WHERE NOT internal;

-- A person's events on one property, for whether they came back or got in touch.
CREATE INDEX idx_profile_events_property_user
    ON lead.profile_events (property_id, user_id, occurred_at)
    WHERE NOT internal;

-- Events the collector could not accept, kept with the reason so a bad app
-- release can be seen and its events replayed. Never counted.
CREATE TABLE lead.rejected_profile_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    payload JSONB NOT NULL,
    reason VARCHAR(200) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version BIGINT NOT NULL DEFAULT 0
);
