-- The origin column only marked scheduled exit bills, which went with scheduled
-- exits on 2026-09-12. V6134 stays in place because it may already have run.

ALTER TABLE billing.billing_cycles DROP CONSTRAINT IF EXISTS chk_billing_cycles_origin;
ALTER TABLE billing.billing_cycles DROP COLUMN IF EXISTS origin;
