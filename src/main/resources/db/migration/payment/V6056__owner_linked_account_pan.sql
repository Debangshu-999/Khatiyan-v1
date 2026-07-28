-- PAN of the account holder. Razorpay's KYC needs it to activate the linked
-- account, and TDS withholding is reported against it, so it is mandatory on
-- our side even though Razorpay's schema marks it optional.
--
-- Nullable only so rows created before this migration survive; the service
-- requires it on every new save.
ALTER TABLE payment.owner_linked_accounts
    ADD COLUMN pan VARCHAR(10);
