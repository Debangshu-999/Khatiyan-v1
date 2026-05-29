CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO billing.deposit_movements (
    id,
    deposit_account_id,
    billing_cycle_id,
    billing_cycle_line_item_id,
    type,
    reason,
    amount_paise,
    balance_after_paise,
    created_by_user_id,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    account.id,
    NULL,
    NULL,
    'ADDITION',
    'Opening deposit',
    account.original_deposit_amount_paise,
    account.original_deposit_amount_paise,
    NULL,
    account.created_at,
    account.updated_at
FROM billing.deposit_accounts account
WHERE account.original_deposit_amount_paise > 0
  AND NOT EXISTS (
      SELECT 1
      FROM billing.deposit_movements movement
      WHERE movement.deposit_account_id = account.id
        AND movement.reason = 'Opening deposit'
  );

ALTER TABLE billing.deposit_accounts
    DROP CONSTRAINT IF EXISTS chk_deposit_accounts_amounts;

ALTER TABLE billing.deposit_accounts
    DROP CONSTRAINT IF EXISTS chk_deposit_accounts_amounts_non_negative;

ALTER TABLE billing.deposit_accounts
    DROP COLUMN IF EXISTS original_deposit_amount_paise,
    DROP COLUMN IF EXISTS current_balance_paise;

ALTER TABLE billing.deposit_movements
    DROP CONSTRAINT IF EXISTS chk_deposit_movements_balance_non_negative;

ALTER TABLE billing.deposit_movements
    DROP COLUMN IF EXISTS balance_after_paise;
