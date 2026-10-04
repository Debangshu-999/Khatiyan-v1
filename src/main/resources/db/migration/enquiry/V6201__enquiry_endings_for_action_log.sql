-- The action log says how an enquiry ended (user, 2026-10-03): closed, and by
-- whom or by itself, expired, or expired because the enquirer raised a new one.
-- Three things the row could not say until now.
--
-- ended_automatically: the 7-day close of a Not interested nobody acted on. It
-- is still named for whoever marked it, so the name alone does not tell it
-- from a close someone pressed.
--
-- replaced_at: when a fresh enquiry from the same enquirer expired this one.
-- Its end reason stays what it was, so this is the only record of it.
--
-- first_ended_*: the closing a change of mind undid. Reopening clears
-- ended_at, and the log would lose that it had ever been closed. There is at
-- most one, because they may change their mind once.
ALTER TABLE enquiry.enquiries
    ADD COLUMN ended_automatically BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN replaced_at TIMESTAMPTZ,
    ADD COLUMN first_ended_at TIMESTAMPTZ,
    ADD COLUMN first_ended_by_user_id UUID,
    ADD COLUMN first_ended_automatically BOOLEAN NOT NULL DEFAULT FALSE,
    ADD CONSTRAINT ck_enquiries_first_ending_whole
        CHECK ((first_ended_at IS NULL) = (first_ended_by_user_id IS NULL));

-- What is already there. Closed 7 days or more after it was marked: the sweep.
UPDATE enquiry.enquiries
SET ended_automatically = TRUE
WHERE ended_at IS NOT NULL
  AND sentiment_set_at IS NOT NULL
  AND ended_at >= sentiment_set_at + INTERVAL '7 days';

-- Cut short of its 30 days while a newer enquiry from the same enquirer at the
-- same property existed, or arrived with the cut: replaced. Nothing else
-- shortens the date (V6198 did the same for the duplicates it found).
UPDATE enquiry.enquiries e
SET replaced_at = e.expires_at
WHERE e.expires_at < e.created_at + INTERVAL '30 days' - INTERVAL '1 minute'
  AND EXISTS (
      SELECT 1
      FROM enquiry.enquiries newer
      WHERE newer.property_id = e.property_id
        AND newer.enquirer_user_id = e.enquirer_user_id
        AND newer.created_at > e.created_at
        AND newer.created_at <= e.expires_at + INTERVAL '1 minute');
