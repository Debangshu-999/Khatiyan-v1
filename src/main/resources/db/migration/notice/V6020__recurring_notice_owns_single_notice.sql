-- Recurring notices now own a single managed notice row instead of tagging
-- every generated notice. Drop the per-notice recurring link and add the
-- notice reference on the recurring side. Normal-notice lists exclude any
-- notice id referenced by notice.recurring_notices.notice_id.

ALTER TABLE notice.notices
    DROP COLUMN IF EXISTS generated_from_recurring_notice_id;

ALTER TABLE notice.recurring_notices
    ADD COLUMN notice_id UUID;
