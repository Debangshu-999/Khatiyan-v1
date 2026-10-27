-- Where a booking token is paid (2026-10-11). Payment setup gains a second
-- section, "Booking token payments": the owner either takes tokens on the
-- same UPI and bank details as bills, or gives tokens details of their own.
--
-- Every property starts on "the same as bills", which is what a token was
-- paid to before this. The token's own details are kept on the property's one
-- payment row, so the setup stays one form saved against one version.
--
-- Only UPI and a bank transfer: those are what a person booking a bed can pay
-- from where they are and record. Cash, a card and a cheque change hands at
-- the property, which records them itself.
ALTER TABLE billing.property_payment_details
    ADD COLUMN token_uses_bill_details BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN token_upi_vpa VARCHAR(120),
    ADD COLUMN token_payee_name VARCHAR(120),
    ADD COLUMN token_upi_qr_image_url VARCHAR(500),
    ADD COLUMN token_upi_phone VARCHAR(10),
    ADD COLUMN token_bank_account_number VARCHAR(34),
    ADD COLUMN token_bank_ifsc VARCHAR(11),
    ADD COLUMN token_bank_account_holder VARCHAR(120);
