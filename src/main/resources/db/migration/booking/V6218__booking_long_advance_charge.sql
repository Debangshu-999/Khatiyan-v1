-- How a booking made further ahead than the ordinary window is charged
-- (user, 2026-10-10).
--
-- The ordinary window is 3 to 21 days after the request, and the one date
-- push of a week makes 28. A bed held for longer than that is charged by the
-- month, and the owner chooses the rate: the room's own rent, or an amount
-- the owner fixes.
--
-- Only the owner's choice is stored. Nothing reads it yet: taking a request
-- for a date that far ahead is not built.
ALTER TABLE booking.settings
    -- ROOM_RENT: the room's monthly rent, for each month in advance.
    -- FIXED_RATE: long_advance_monthly_paise, for each month in advance.
    -- NULL: the owner has not chosen.
    ADD COLUMN long_advance_charge VARCHAR(20),
    -- Kept when the owner switches to the room's rent, so switching back
    -- restores it.
    ADD COLUMN long_advance_monthly_paise BIGINT,
    ADD CONSTRAINT chk_booking_settings_long_advance_charge
        CHECK (long_advance_charge IS NULL OR long_advance_charge IN ('ROOM_RENT', 'FIXED_RATE')),
    ADD CONSTRAINT chk_booking_settings_long_advance_amount
        CHECK (long_advance_monthly_paise IS NULL OR long_advance_monthly_paise > 0),
    -- A fixed rate that is chosen has its amount.
    ADD CONSTRAINT chk_booking_settings_long_advance_complete
        CHECK (long_advance_charge IS DISTINCT FROM 'FIXED_RATE' OR long_advance_monthly_paise IS NOT NULL);
