-- Payability is decided once, at end-tenancy, and settlement executes that
-- decision without being able to revisit it.
--
-- Nullable on purpose: a NULL means "no exit decision was recorded", which is
-- the honest state for every account that predates this column and for every
-- account whose tenancy is still running. It is not the same as "payable", and
-- settlement must not read it as one.
ALTER TABLE billing.deposit_accounts
    ADD COLUMN payable_at_exit boolean;

COMMENT ON COLUMN billing.deposit_accounts.payable_at_exit IS
    'Decided at end-tenancy: TRUE refund the remainder, FALSE close unpaid, NULL no decision recorded yet.';
