UPDATE property.properties
SET billing_collection_timing = 'CYCLE_START'
WHERE billing_collection_timing <> 'CYCLE_START';

UPDATE billing.billing_cycles
SET billing_collection_timing = 'CYCLE_START'
WHERE billing_collection_timing <> 'CYCLE_START';

ALTER TABLE property.properties
DROP CONSTRAINT IF EXISTS chk_properties_billing_collection_timing;

ALTER TABLE property.properties
ADD CONSTRAINT chk_properties_billing_collection_timing
CHECK (billing_collection_timing = 'CYCLE_START');

ALTER TABLE billing.billing_cycles
DROP CONSTRAINT IF EXISTS chk_billing_cycles_collection_timing;

ALTER TABLE billing.billing_cycles
ADD CONSTRAINT chk_billing_cycles_collection_timing
CHECK (billing_collection_timing = 'CYCLE_START');
