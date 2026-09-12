-- Spring Modulith 2.x event_publication schema (their "v2").
--
-- Modulith 1.3 read six columns. Modulith 2.1 reads nine, and it does not
-- migrate the table itself — it just issues the wider SELECT and the context
-- dies at startup with `column "status" does not exist`, which names the
-- symptom and not the upgrade that caused it.
--
-- Column definitions copied from the shipped
-- org/springframework/modulith/events/jdbc/schemas/v2/schema-postgresql.sql so
-- ours cannot drift from theirs. All three are nullable there, and this table
-- is deliberately not a JPA entity, so ddl-auto: validate never inspects it.
ALTER TABLE public.event_publication
    ADD COLUMN IF NOT EXISTS status                 TEXT,
    ADD COLUMN IF NOT EXISTS completion_attempts    INT,
    ADD COLUMN IF NOT EXISTS last_resubmission_date TIMESTAMP WITH TIME ZONE;

-- Backfill, and this is the part that matters.
--
-- Rows written by 1.3 have no status at all. A publication whose listener never
-- finished is re-submitted on restart, and under 2.x that selection is by
-- status — so leaving these null would quietly stop exactly the retries this
-- table exists to guarantee. An unfinished notification or expense row would
-- simply never be delivered, with nothing logged.
--
-- completion_date is the 1.3 record of what finished, so it is the honest
-- source for the status each old row should have had.
UPDATE public.event_publication
SET status = CASE WHEN completion_date IS NULL THEN 'PUBLISHED' ELSE 'COMPLETED' END,
    completion_attempts = COALESCE(completion_attempts, 0)
WHERE status IS NULL;
