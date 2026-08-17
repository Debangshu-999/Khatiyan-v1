-- Recurrence stops being inferred from the start date.
--
-- Until now `active_from` did two jobs: it bounded the active window AND it
-- carried the schedule — WEEKLY took its day-of-week, MONTHLY took its
-- day-of-month. One input meaning two things is why the create screen could
-- only ever offer a single date picker, and why a monthly notice could land on
-- exactly one day.
--
-- After this, `active_from` means only "not before this date".

ALTER TABLE notice.recurring_notices
    ADD COLUMN IF NOT EXISTS day_of_week VARCHAR(10) NULL;

CREATE TABLE IF NOT EXISTS notice.recurring_notice_days_of_month (
    recurring_notice_id UUID NOT NULL
        REFERENCES notice.recurring_notices (id) ON DELETE CASCADE,
    day_of_month SMALLINT NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    PRIMARY KEY (recurring_notice_id, day_of_month)
);

-- Backfill from what the old rows already encoded, so existing templates keep
-- generating on exactly the days they generate on today.
UPDATE notice.recurring_notices
SET day_of_week = UPPER(TO_CHAR(active_from, 'FMDAY'))
WHERE frequency = 'WEEKLY'
  AND day_of_week IS NULL
  AND active_from IS NOT NULL;

INSERT INTO notice.recurring_notice_days_of_month (recurring_notice_id, day_of_month)
SELECT id, EXTRACT(DAY FROM active_from)::SMALLINT
FROM notice.recurring_notices
WHERE frequency = 'MONTHLY'
  AND active_from IS NOT NULL
ON CONFLICT DO NOTHING;
