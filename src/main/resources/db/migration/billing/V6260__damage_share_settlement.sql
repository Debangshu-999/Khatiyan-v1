-- Damage at checkout (user, 2026-10-31): a share can be waived for good, and
-- can take money from the deposit, at the exit or through its Damage bill.
ALTER TABLE billing.damage_record_shares
    ADD COLUMN waived        boolean NOT NULL DEFAULT false,
    ADD COLUMN deposit_paise bigint  NOT NULL DEFAULT 0,
    ADD CONSTRAINT chk_damage_share_deposit CHECK (deposit_paise >= 0 AND deposit_paise <= amount_paise);
