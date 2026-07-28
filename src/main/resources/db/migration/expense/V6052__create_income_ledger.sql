-- Append-only manual income ledger for the finance / P&L module. Owners record
-- ad-hoc property income (parking, laundry, misc) that does NOT flow through
-- billing. Corrections add a REVERSAL row (negative amount) pointing at the
-- original, so a month's net manual income is simply SUM(amount_paise).
CREATE TABLE expense.income_entries (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    source VARCHAR(120) NOT NULL,
    received_from VARCHAR(160),
    amount_paise BIGINT NOT NULL,
    received_date DATE NOT NULL,
    entry_type VARCHAR(16) NOT NULL,
    reverses_income_id UUID,
    description VARCHAR(500),
    created_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_income_entries_entry_type
        CHECK (entry_type IN ('MANUAL', 'REVERSAL'))
);

CREATE INDEX idx_income_entries_property_received
    ON expense.income_entries (property_id, received_date); 