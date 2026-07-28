-- Who closed the row, alongside the existing resolved_at. A resolution that
-- leaves the tenant without their money must be attributable to a person, not
-- just a timestamp.
ALTER TABLE payment.unapplied_payments
    ADD COLUMN resolved_by_user_id UUID;
