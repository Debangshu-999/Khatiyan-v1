-- Refund lots.
--
-- The balance is fungible but a refund is not: money can only go back to the
-- card or UPI handle that sent it, so every rupee has to remember which payment
-- funded it. Each top-up therefore carries how much of ITSELF is still
-- refundable — the amount, minus whatever spending has since consumed it.
--
-- Spending walks the lots oldest-first. Refunds walk what is left.
--
-- This lands now rather than with the refund flow itself, because adding it
-- later would mean reconstructing lot history for balances that had already
-- been spent against, which cannot be done from the ledger after the fact.
ALTER TABLE servicebalance.service_balance_top_ups
    ADD COLUMN remaining_refundable_paise BIGINT NOT NULL DEFAULT 0;

-- Only a captured top-up funds anything, so an unpaid row's lot is zero. The
-- credit path sets this to the full amount at the moment it credits.
ALTER TABLE servicebalance.service_balance_top_ups
    ADD CONSTRAINT ck_service_balance_top_up_lot_within_amount
    CHECK (remaining_refundable_paise >= 0 AND remaining_refundable_paise <= amount_paise);

-- Finding the next lot to spend from, and later the next one to refund from.
CREATE INDEX idx_service_balance_top_ups_lot
    ON servicebalance.service_balance_top_ups (account_id, created_at)
    WHERE remaining_refundable_paise > 0;
