-- Why a one-off bill was cancelled, and by whom.
--
-- A one-off bill raised with a wrong amount can now be cancelled by management.
-- The reason is kept on the bill itself so both sides can still see what
-- happened to it, rather than a bill that simply turned grey.
ALTER TABLE billing.billing_cycles
    ADD COLUMN cancellation_reason  VARCHAR(200),
    ADD COLUMN cancelled_at         TIMESTAMPTZ,
    ADD COLUMN cancelled_by_user_id UUID;
