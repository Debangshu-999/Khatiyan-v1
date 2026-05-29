ALTER TABLE property.properties
    RENAME COLUMN daily_late_fee_paise TO rent_late_fee_per_day_paise;

ALTER TABLE property.properties
    DROP CONSTRAINT IF EXISTS chk_properties_daily_late_fee_non_negative;

ALTER TABLE property.properties
    ADD CONSTRAINT chk_properties_rent_late_fee_per_day_non_negative
        CHECK (rent_late_fee_per_day_paise IS NULL OR rent_late_fee_per_day_paise >= 0);
