-- Money that reached us but never reached a balance.
--
-- The usual failure is harmless: with manual capture, a payment we cannot match
-- is simply left uncaptured and the gateway returns it. But a payment can still
-- be CAPTURED and never credited — our own process dying between the capture
-- call and the ledger write, or a captured payment arriving for an order whose
-- row we cannot find.
--
-- That money is ours and should not be. It goes straight back to the payer, and
-- it must NOT touch the ledger: nothing was ever credited, so debiting a balance
-- to return it would take the money twice.
--
-- Hence a nullable lot. An unapplied payment has no top-up to draw from, because
-- it never funded anything.
ALTER TABLE servicebalance.service_balance_refunds
    ALTER COLUMN top_up_id DROP NOT NULL;

-- The payment being returned. Always known, even when the top-up is not.
ALTER TABLE servicebalance.service_balance_refunds
    ADD COLUMN provider_payment_id VARCHAR(100);

-- One refund per payment for this path, so a retried sweep cannot send the same
-- money back twice. Partial, because ordinary lot refunds share a payment id
-- whenever a balance is returned in pieces.
CREATE UNIQUE INDEX uq_service_balance_refunds_unapplied_payment
    ON servicebalance.service_balance_refunds (provider_payment_id)
    WHERE reason = 'UNAPPLIED_PAYMENT';
