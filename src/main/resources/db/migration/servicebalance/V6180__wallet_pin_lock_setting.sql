ALTER TABLE servicebalance.service_balance_accounts
    ADD COLUMN wallet_lock_enabled boolean NOT NULL DEFAULT false;
