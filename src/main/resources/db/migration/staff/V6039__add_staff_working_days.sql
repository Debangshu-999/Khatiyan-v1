-- Daily-wage staff work only on selected weekdays; the monthly payout is
-- daily-rate x (working days that fall in the month), not a flat 7-day week.
-- Stored as a 7-bit mask (Mon=bit0 .. Sun=bit6); 127 = all seven days.
-- Existing rows default to all seven days so payouts are unchanged until edited.
-- Ignored for MONTHLY staff (kept at 127).
ALTER TABLE staff.staff_members
    ADD COLUMN working_days_mask integer NOT NULL DEFAULT 127;
