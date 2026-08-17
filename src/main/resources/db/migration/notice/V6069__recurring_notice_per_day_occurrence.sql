-- Reverses V6020. A recurring notice no longer owns one reused notice row whose
-- window is slid each day; instead every generation creates that day's own
-- notice. Per-day rows are what make the upcoming-notices window editable: an
-- owner can retitle, re-body or attach to today's lunch notice without those
-- edits bleeding into tomorrow, because tomorrow gets a fresh row from the
-- template.
--
-- The link moves back onto the notice so each occurrence carries its own
-- provenance. Owner-facing normal-notice lists now exclude occurrences with a
-- plain "generated_from_recurring_notice_id IS NULL" check instead of a
-- NOT IN subquery against recurring_notices.notice_id.

ALTER TABLE notice.notices
    ADD COLUMN generated_from_recurring_notice_id UUID,
    ADD COLUMN occurrence_date DATE;

-- One occurrence per template per day. recurring_notices.last_processed_for_date
-- is the primary guard; this is the backstop that makes a double run impossible
-- rather than merely unlikely.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notices_recurring_occurrence
    ON notice.notices (generated_from_recurring_notice_id, occurrence_date)
    WHERE generated_from_recurring_notice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notices_occurrence_lookup
    ON notice.notices (property_id, visible_from)
    WHERE generated_from_recurring_notice_id IS NOT NULL;

-- Drop the managed rows created under the old model. They carry no history worth
-- keeping: each was a single row whose window was rewritten daily, so it records
-- only its most recent day. Left behind they would surface as untethered normal
-- notices in the owner list, because nothing would mark them as recurring.
DELETE FROM notice.notices
WHERE id IN (
    SELECT notice_id
    FROM notice.recurring_notices
    WHERE notice_id IS NOT NULL
);

ALTER TABLE notice.recurring_notices
    DROP COLUMN IF EXISTS notice_id;

-- Force a clean regeneration on the next scheduler tick so every active template
-- materialises today's occurrence under the new model.
UPDATE notice.recurring_notices
SET last_processed_for_date = NULL,
    last_generated_for_date = NULL;
