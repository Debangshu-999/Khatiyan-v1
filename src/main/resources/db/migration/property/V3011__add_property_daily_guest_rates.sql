ALTER TABLE property.properties
    ADD COLUMN IF NOT EXISTS daily_guest_ac_rate_paise BIGINT,
    ADD COLUMN IF NOT EXISTS daily_guest_non_ac_rate_paise BIGINT;

ALTER TABLE property.properties
    ADD CONSTRAINT chk_property_daily_guest_ac_rate_positive
        CHECK (daily_guest_ac_rate_paise IS NULL OR daily_guest_ac_rate_paise > 0),
    ADD CONSTRAINT chk_property_daily_guest_non_ac_rate_positive
        CHECK (daily_guest_non_ac_rate_paise IS NULL OR daily_guest_non_ac_rate_paise > 0);
