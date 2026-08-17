-- Weekly templates repeat on several weekdays, not one.
--
-- "Every Monday and Tuesday" is an ordinary schedule and the single
-- `day_of_week` column added in V6089 could not hold it. Mirrors the
-- days-of-month table added alongside it.
--
-- VARCHAR(40) matches property.property_facilities, the existing enum
-- collection table that already passes ddl-auto: validate.

CREATE TABLE IF NOT EXISTS notice.recurring_notice_days_of_week (
    recurring_notice_id UUID NOT NULL
        REFERENCES notice.recurring_notices (id) ON DELETE CASCADE,
    day_of_week VARCHAR(40) NOT NULL,
    PRIMARY KEY (recurring_notice_id, day_of_week)
);

INSERT INTO notice.recurring_notice_days_of_week (recurring_notice_id, day_of_week)
SELECT id, day_of_week
FROM notice.recurring_notices
WHERE day_of_week IS NOT NULL
ON CONFLICT DO NOTHING;

-- Dropped rather than left orphaned. It was introduced one migration ago, its
-- contents are now in the table above, and nothing else reads it — leaving it
-- would only invite a future reader to trust a column the model ignores.
ALTER TABLE notice.recurring_notices
    DROP COLUMN IF EXISTS day_of_week;
