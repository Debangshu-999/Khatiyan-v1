-- A one-off bill's own lines, written when it is raised, are the bill itself
-- (2026-09-28). The owner's "Test Bill ₹20" or an exit's charges are what the
-- bill IS, not something done to it afterwards, so they stay out of the Action
-- history and cannot be reverted to zero. A charge or discount added later is
-- still an action.
ALTER TABLE billing.billing_cycle_line_items
    ADD COLUMN issued_with_bill BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing one-off bills: the lines written in the same moment the bill was
-- raised. Every creator writes them in the bill's own transaction, so they sit
-- within a second of it. A charge added by hand comes minutes or days later.
UPDATE billing.billing_cycle_line_items li
SET issued_with_bill = TRUE
FROM billing.billing_cycles c
WHERE li.billing_cycle_id = c.id
  AND c.category = 'ONE_OFF'
  AND li.created_at <= c.created_at + INTERVAL '5 seconds';
