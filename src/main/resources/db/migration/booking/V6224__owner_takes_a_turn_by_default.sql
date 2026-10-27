-- Where requests are assigned by the system, the owner takes a turn unless
-- they opt out (user, 2026-10-11: "it should include the owner in turns by
-- default"). It was the other way round.
--
-- Rows saved before today carry FALSE because that was the default, not
-- because anyone chose it: the switch only shows once turns are picked. So
-- they move with the default. An owner who wants out switches it off again.
ALTER TABLE booking.settings
    ALTER COLUMN include_owner_in_turns SET DEFAULT TRUE;

UPDATE booking.settings
SET include_owner_in_turns = TRUE, version = version + 1, updated_at = CURRENT_TIMESTAMP
WHERE include_owner_in_turns = FALSE;
