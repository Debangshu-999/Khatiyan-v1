-- Bank and branch resolved from the IFSC at onboarding, so the app can show the
-- owner the bank they recognise instead of a raw code. Nullable: rows added
-- before this, or added while the lookup service was unreachable, have none.
ALTER TABLE payment.owner_linked_accounts
    ADD COLUMN bank_name VARCHAR(160),
    ADD COLUMN branch_name VARCHAR(160);
