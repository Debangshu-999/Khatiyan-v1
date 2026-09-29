-- Which ways a property takes money (2026-09-28). One switch per method, plus
-- whether a cash payment needs the tenant's code. Every property starts on cash
-- only, with no code: an owner ticks the rest in Payment setup. The UPI and
-- bank details already saved are kept, just not offered until ticked.
ALTER TABLE billing.property_payment_details
    ADD COLUMN accepts_upi BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN accepts_bank_transfer BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN accepts_card BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN accepts_cheque BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN accepts_cash BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN cash_otp_required BOOLEAN NOT NULL DEFAULT FALSE;

-- A claim now names the way the tenant paid. Every claim so far came from the
-- UPI link, so that is what the old rows were.
ALTER TABLE billing.payment_intents ADD COLUMN method VARCHAR(20) NOT NULL DEFAULT 'UPI';

-- A bank, card or cheque claim has no UPI address to snapshot.
ALTER TABLE billing.payment_intents ALTER COLUMN upi_vpa DROP NOT NULL;
