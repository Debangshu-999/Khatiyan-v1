-- Record the actual day each salary month was opened (rather than assuming the
-- 1st). The daily scheduler opens the current month for every eligible account
-- on the day it first becomes due: the 1st for accounts that already existed, or
-- the next run after a mid-month joiner is added (e.g. joins on the 12th -> the
-- month opens on the 13th). Manual opens record the current date too. A future
-- payroll policy can prorate using (last day of month - opened_on).
ALTER TABLE staff.salary_months
    ADD COLUMN IF NOT EXISTS opened_on DATE;

-- Backfill existing rows from their creation timestamp, in IST.
UPDATE staff.salary_months
SET opened_on = (created_at AT TIME ZONE 'Asia/Kolkata')::date
WHERE opened_on IS NULL;

ALTER TABLE staff.salary_months
    ALTER COLUMN opened_on SET NOT NULL;
