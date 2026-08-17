-- Clear the one-time backfill that seeded the feed from historic state.
--
-- The first build of this feature seeded the store from the old state-derived
-- view so history was not lost. That has since been dropped: the feed is meant
-- to start empty and record only what actually happens from now on, and it only
-- ever shows the last 7 days anyway.
--
-- Seeded rows are exactly the ones with no subject: the backfill had no id for
-- the tenancy/concern/notice behind each entry, while every listener-written row
-- carries one. So this removes the backfill and nothing else.
DELETE FROM dashboard.activity_events
WHERE subject_id IS NULL;
