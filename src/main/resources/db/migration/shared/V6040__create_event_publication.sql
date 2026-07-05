-- Spring Modulith event publication registry.
--
-- Every domain event published inside a transaction gets a row here (written in
-- that same transaction), one per listener. The row's completion_date is set
-- when the listener finishes; incomplete rows are re-submitted on application
-- restart (spring.modulith.events.republish-outstanding-events-on-restart), so
-- cross-module side effects (notifications, expense auto-rows, discovery
-- profiles) survive a crash between commit and listener execution.
--
-- Managed by Spring Modulith's JDBC registry — intentionally NOT a JPA entity,
-- so Hibernate ddl-auto: validate never looks at it. Column layout must match
-- Spring Modulith 1.3.x's PostgreSQL schema exactly.
CREATE TABLE IF NOT EXISTS public.event_publication (
    id               UUID NOT NULL,
    listener_id      TEXT NOT NULL,
    event_type       TEXT NOT NULL,
    serialized_event TEXT NOT NULL,
    publication_date TIMESTAMP WITH TIME ZONE NOT NULL,
    completion_date  TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS event_publication_serialized_event_hash_idx
    ON public.event_publication USING hash (serialized_event);
CREATE INDEX IF NOT EXISTS event_publication_by_completion_date_idx
    ON public.event_publication (completion_date);
