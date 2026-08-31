-- Billing follows tenancy: a daily guest has no account, so a bill raised
-- against that stay has no tenant user to point at.
--
-- The column stays for every monthly tenancy and every existing daily one — it
-- is what powers the tenant's own "my bills" view. A guest simply never matches
-- those queries, which is the correct outcome rather than a gap: there is no
-- app for them to open. What identifies the payer on a guest bill is
-- tenant_name_snapshot, which billing already stamps at creation and never
-- re-reads.
--
-- Nothing is backfilled. Existing rows keep the user they were raised for.

ALTER TABLE billing.billing_cycles
    ALTER COLUMN tenant_user_id DROP NOT NULL;

ALTER TABLE billing.billing_cycle_line_items
    ALTER COLUMN tenant_user_id DROP NOT NULL;

ALTER TABLE billing.billing_manual_payments
    ALTER COLUMN tenant_user_id DROP NOT NULL;
