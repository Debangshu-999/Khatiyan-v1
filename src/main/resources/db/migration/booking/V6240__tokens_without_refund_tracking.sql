-- Refunds are not tracked (user, 2026-10-28). A token owed back ends as REFUND_DUE
-- ("Refundable") and paying it is the property's own business, so "refund sent"
-- and "refunded" are gone: rows in them are owed back again, as they were before.
-- A guest who did not arrive leaves the token DECISION_PENDING ("Action pending")
-- until the handler refunds or keeps it. A booking onboarded as a tenant makes
-- its received token KEPT ("Non refundable"), until the first bill adjusts it.

UPDATE booking.tokens
SET status = 'REFUND_DUE', updated_at = CURRENT_TIMESTAMP
WHERE status IN ('REFUND_SENT', 'REFUNDED');

-- Onboarded bookings whose stay has not started yet.
UPDATE booking.tokens t
SET status = 'KEPT', updated_at = CURRENT_TIMESTAMP
FROM booking.requests r
WHERE r.id = t.request_id AND t.status = 'RECEIVED'
  AND r.status = 'CONFIRMED' AND r.tenancy_id IS NOT NULL;

ALTER TABLE booking.tokens DROP CONSTRAINT chk_booking_tokens_status;
ALTER TABLE booking.tokens ADD CONSTRAINT chk_booking_tokens_status
    CHECK (status IN ('NOT_REQUIRED', 'DUE', 'CLAIMED', 'NOT_RECEIVED', 'RECEIVED',
                      'ADJUSTED', 'KEPT', 'REFUND_DUE', 'DECISION_PENDING'));

-- Only money that arrived can be held, adjusted, kept, owed back or waiting on a decision.
ALTER TABLE booking.tokens DROP CONSTRAINT chk_booking_tokens_received_states;
ALTER TABLE booking.tokens ADD CONSTRAINT chk_booking_tokens_received_states
    CHECK ((status IN ('RECEIVED', 'ADJUSTED', 'KEPT', 'REFUND_DUE', 'DECISION_PENDING'))
         = (received_at IS NOT NULL));

ALTER TABLE booking.tokens DROP CONSTRAINT chk_booking_tokens_refund_due_since;
ALTER TABLE booking.tokens ADD CONSTRAINT chk_booking_tokens_refund_due_since
    CHECK ((status = 'REFUND_DUE') = (refund_due_since IS NOT NULL));

-- The refund columns are no longer written. What earlier rows said stays.
ALTER TABLE booking.tokens DROP CONSTRAINT chk_booking_tokens_refund_sent;
ALTER TABLE booking.tokens DROP CONSTRAINT chk_booking_tokens_refunded;

-- The lever that stopped new tokens over an old refund is gone with them.
DROP INDEX IF EXISTS booking.idx_booking_tokens_refund_due;
