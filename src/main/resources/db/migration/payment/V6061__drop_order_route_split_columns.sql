-- The split moved off the order and onto payment.owner_transfers.
--
-- These columns were filled at order creation from an estimated gateway fee.
-- Keeping them would leave two sources of truth for how a payment was divided,
-- one of them a guess — exactly the ambiguity that causes money bugs. The
-- transfer ledger is now the only record, and it stores the fee the gateway
-- actually charged.
ALTER TABLE payment.payment_orders
    DROP COLUMN owner_user_id,
    DROP COLUMN platform_fee_paise,
    DROP COLUMN gateway_fee_paise,
    DROP COLUMN owner_net_paise;
