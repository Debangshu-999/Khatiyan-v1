-- An owner may register up to two payout banks but only one receives money at a
-- time. The cap of two is enforced in the service; the "exactly one active"
-- invariant is enforced here so no code path can leave two rows collecting.

ALTER TABLE payment.owner_linked_accounts
    DROP CONSTRAINT uk_owner_linked_accounts_owner;

-- Existing rows were the owner's only account, so they stay the active one.
ALTER TABLE payment.owner_linked_accounts
    ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT TRUE;

-- Partial unique index: at most one active account per owner, any number of
-- inactive ones (the service caps the total at two).
CREATE UNIQUE INDEX uk_owner_linked_accounts_primary
    ON payment.owner_linked_accounts (owner_user_id)
    WHERE is_primary;

CREATE INDEX idx_owner_linked_accounts_owner
    ON payment.owner_linked_accounts (owner_user_id);
