CREATE SCHEMA IF NOT EXISTS dashboard;

-- Persisted "Latest events" feed.
--
-- The feed used to be recomputed on every dashboard request by fanning out to
-- six modules and deriving events from CURRENT state. That made history rewrite
-- itself: TENANCY_STARTED came from *active* tenancies, so ending a tenancy
-- erased the fact that it ever started, and staff events were derived from
-- present employee rows. It also could not answer "what happened last Tuesday".
--
-- Rows are append-only facts written by listeners on domain events. Nothing here
-- is recomputed, so an event survives whatever happens to the thing it describes.
CREATE TABLE dashboard.activity_events (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    type VARCHAR(48) NOT NULL,
    title VARCHAR(200) NOT NULL,
    subtitle VARCHAR(300),
    -- Who caused it, when known. Nullable: scheduler-driven events have no actor.
    actor_user_id UUID,
    -- The row this event is about (tenancy, cycle, concern...), for future
    -- drill-through. Deliberately untyped and unconstrained: the referenced row
    -- may be deleted, and the event must outlive it.
    subject_id UUID,
    -- When it actually happened, which is NOT always when the row was written
    -- (a backfilled or scheduler-replayed event can be older than its row).
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

-- The only read pattern: newest-first for one property.
CREATE INDEX idx_activity_events_property_occurred
    ON dashboard.activity_events (property_id, occurred_at DESC);

-- Listeners are at-least-once (see spring.modulith.events), so the same domain
-- event can be delivered twice after a crash between commit and listener. This
-- makes the second write a no-op instead of a duplicate row in the feed.
CREATE UNIQUE INDEX uq_activity_events_dedupe
    ON dashboard.activity_events (property_id, type, subject_id, occurred_at)
    WHERE subject_id IS NOT NULL;
