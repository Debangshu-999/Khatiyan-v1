-- Immutable after first write: token receipt and booking confirmation are separate steps.
-- Existing confirmed bookings are retained. An agreed request whose token has already
-- been received is awaiting the property's explicit final confirmation, without a token clock.
ALTER TABLE booking.requests DROP CONSTRAINT chk_booking_requests_status;
ALTER TABLE booking.requests ADD CONSTRAINT chk_booking_requests_status
    CHECK (status IN ('AWAITING_HANDLER', 'AWAITING_TENANT', 'AWAITING_TOKEN',
                      'TOKEN_RECEIVED', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'MOVED_IN'));
ALTER TABLE booking.requests ADD CONSTRAINT chk_booking_requests_token_received
    CHECK (status <> 'TOKEN_RECEIVED'
        OR (agreed_at IS NOT NULL AND token_required AND confirmed_at IS NULL
            AND NOT token_claim_waiting));

DROP INDEX booking.uq_booking_requests_open_per_prospect_property;
CREATE UNIQUE INDEX uq_booking_requests_open_per_prospect_property
    ON booking.requests (property_id, prospect_user_id)
    WHERE status IN ('AWAITING_HANDLER', 'AWAITING_TENANT', 'AWAITING_TOKEN',
                    'TOKEN_RECEIVED', 'CONFIRMED');

UPDATE booking.requests r
SET status = 'TOKEN_RECEIVED', confirmed_at = NULL, token_claim_waiting = FALSE,
    version = version + 1, updated_at = CURRENT_TIMESTAMP
WHERE r.status = 'AWAITING_TOKEN' AND r.tenancy_id IS NULL AND r.token_required
    AND EXISTS (SELECT 1 FROM booking.tokens t WHERE t.request_id = r.id AND t.status = 'RECEIVED');

-- Correct the receipt event's resulting stage for repaired open requests, not historical confirmations.
UPDATE booking.actions a SET status_after = 'TOKEN_RECEIVED'
WHERE a.type = 'TOKEN_RECEIVED' AND a.status_after = 'CONFIRMED'
    AND EXISTS (SELECT 1 FROM booking.requests r WHERE r.id = a.request_id AND r.status = 'TOKEN_RECEIVED');
