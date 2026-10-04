-- Where a visit was before its latest move (user, 2026-10-04).
--
-- Manage Visits lists today's visits by slot. A visit moved to another day
-- stays on that list, under the slot it left, as Rescheduled, and is in
-- Upcoming as the visit it now is. The row only knew where the visit is, so
-- the day it left could not say anything about it.
--
-- The latest move only: a visit moved twice in a day shows under the last
-- slot it left.
ALTER TABLE lead.visits
    ADD COLUMN moved_from_date DATE,
    ADD COLUMN moved_from_slot_start_minute INTEGER,
    ADD COLUMN moved_from_slot_end_minute INTEGER,
    ADD COLUMN moved_at TIMESTAMPTZ,
    ADD CONSTRAINT chk_visits_moved_from_complete
        CHECK ((moved_from_date IS NULL) = (moved_from_slot_start_minute IS NULL)
            AND (moved_from_date IS NULL) = (moved_from_slot_end_minute IS NULL)
            AND (moved_from_date IS NULL) = (moved_at IS NULL));
