ALTER TABLE property.properties
    ADD COLUMN IF NOT EXISTS billing_collection_timing VARCHAR(20) NOT NULL DEFAULT 'CYCLE_START',
    ADD COLUMN IF NOT EXISTS rent_grace_days INTEGER NOT NULL DEFAULT 3;

ALTER TABLE property.properties
    DROP CONSTRAINT IF EXISTS chk_properties_billing_collection_timing;

ALTER TABLE property.properties
    ADD CONSTRAINT chk_properties_billing_collection_timing
        CHECK (billing_collection_timing IN ('CYCLE_START', 'CYCLE_END'));

ALTER TABLE property.properties
    DROP CONSTRAINT IF EXISTS chk_properties_rent_grace_days;

ALTER TABLE property.properties
    ADD CONSTRAINT chk_properties_rent_grace_days
        CHECK (rent_grace_days BETWEEN 0 AND 30);

ALTER TABLE billing.billing_cycles
    ADD COLUMN IF NOT EXISTS billing_collection_timing VARCHAR(20) NOT NULL DEFAULT 'CYCLE_START',
    ADD COLUMN IF NOT EXISTS rent_grace_days INTEGER NOT NULL DEFAULT 3;

ALTER TABLE billing.billing_cycles
    DROP CONSTRAINT IF EXISTS chk_billing_cycles_collection_timing;

ALTER TABLE billing.billing_cycles
    ADD CONSTRAINT chk_billing_cycles_collection_timing
        CHECK (billing_collection_timing IN ('CYCLE_START', 'CYCLE_END'));

ALTER TABLE billing.billing_cycles
    DROP CONSTRAINT IF EXISTS chk_billing_cycles_rent_grace_days;

ALTER TABLE billing.billing_cycles
    ADD CONSTRAINT chk_billing_cycles_rent_grace_days
        CHECK (rent_grace_days BETWEEN 0 AND 30);
