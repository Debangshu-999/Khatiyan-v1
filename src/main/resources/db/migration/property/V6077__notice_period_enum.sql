-- notice_period_days (free-form integer) becomes notice_period (enum).
--
-- "One month from 15 Jan" is 15 Feb; "30 days from 15 Jan" is 14 Feb. A billing
-- cycle is a calendar month anchored on the tenant's move-in day, so the
-- day-count answer lands one day off the cycle boundary -- which flips the
-- generation gate and creates a partial cycle nobody can price.
--
-- The enum also deletes a whole class of bad data by construction: no 0, no 400,
-- no validation for anyone to forget.
--
-- Existing values are 15 (x1) and 30 (x2), mapping cleanly onto FIFTEEN_DAYS and
-- ONE_MONTH. Nothing is lossy.

ALTER TABLE property.properties
    ADD COLUMN IF NOT EXISTS notice_period VARCHAR(20);

UPDATE property.properties
SET notice_period = CASE
        WHEN notice_period_days IS NULL   THEN 'ONE_MONTH'
        WHEN notice_period_days <= 5      THEN 'FIVE_DAYS'
        WHEN notice_period_days <= 15     THEN 'FIFTEEN_DAYS'
        WHEN notice_period_days <= 31     THEN 'ONE_MONTH'
        WHEN notice_period_days <= 62     THEN 'TWO_MONTHS'
        ELSE 'THREE_MONTHS'
    END
WHERE notice_period IS NULL;

ALTER TABLE property.properties
    ALTER COLUMN notice_period SET NOT NULL;

ALTER TABLE property.properties
    DROP CONSTRAINT IF EXISTS chk_properties_notice_period;

ALTER TABLE property.properties
    ADD CONSTRAINT chk_properties_notice_period
        CHECK (notice_period IN (
            'FIVE_DAYS', 'FIFTEEN_DAYS', 'ONE_MONTH', 'TWO_MONTHS', 'THREE_MONTHS'));

-- The old column goes. Keeping both would let them drift, and there is no reader
-- left: the day count is derived from the enum for display only.
ALTER TABLE property.properties
    DROP CONSTRAINT IF EXISTS chk_properties_notice_period_days;

ALTER TABLE property.properties
    DROP COLUMN IF EXISTS notice_period_days;
