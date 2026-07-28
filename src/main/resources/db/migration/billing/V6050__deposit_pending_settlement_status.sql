-- Allow the new PENDING_SETTLEMENT deposit state: a tenancy has ended but the
-- owner deferred settling the deposit (it awaits settlement in the action center).
ALTER TABLE billing.deposit_accounts
    DROP CONSTRAINT chk_deposit_accounts_status;

ALTER TABLE billing.deposit_accounts
    ADD CONSTRAINT chk_deposit_accounts_status
        CHECK (status IN ('ACTIVE', 'PENDING_SETTLEMENT', 'SETTLED'));
