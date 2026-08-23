-- Enquiries now age out. Before this they lived forever: an owner's list grew
-- without bound, and a NEW enquiry nobody answered blocked that enquirer from
-- ever asking about the property again, because the partial unique index below
-- is keyed on status = 'NEW'.
--
-- Expiry is what unblocks them. Flipping a stale enquiry to EXPIRED both greys
-- it out for the owner and releases the index, so the enquirer can ask afresh.

ALTER TABLE enquiry.enquiries
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Backfill from what each row already knows. Seven days from when it was asked,
-- so existing enquiries land on the same rule as new ones rather than all
-- expiring at once on deploy.
UPDATE enquiry.enquiries
SET expires_at = created_at + INTERVAL '7 days'
WHERE expires_at IS NULL;

ALTER TABLE enquiry.enquiries
    ALTER COLUMN expires_at SET NOT NULL;

-- The sweep reads exactly this: still open, and past its date.
CREATE INDEX IF NOT EXISTS idx_enquiries_open_expiring
    ON enquiry.enquiries (expires_at)
    WHERE status = 'NEW';
