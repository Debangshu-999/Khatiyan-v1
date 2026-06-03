CREATE SCHEMA IF NOT EXISTS shared;

CREATE SEQUENCE IF NOT EXISTS shared.reference_code_seq START WITH 1 INCREMENT BY 1;

ALTER TABLE property.properties
    ADD COLUMN reference_code VARCHAR(40);

UPDATE property.properties
SET reference_code = 'PROP-' || EXTRACT(YEAR FROM CURRENT_DATE)::INT || '-' || LPAD(nextval('shared.reference_code_seq')::TEXT, 6, '0')
WHERE reference_code IS NULL;

ALTER TABLE property.properties
    ALTER COLUMN reference_code SET NOT NULL;

CREATE UNIQUE INDEX ux_properties_reference_code
    ON property.properties(reference_code);

ALTER TABLE tenancy.tenancies
    ADD COLUMN reference_code VARCHAR(40);

UPDATE tenancy.tenancies
SET reference_code = 'TEN-' || EXTRACT(YEAR FROM CURRENT_DATE)::INT || '-' || LPAD(nextval('shared.reference_code_seq')::TEXT, 6, '0')
WHERE reference_code IS NULL;

ALTER TABLE tenancy.tenancies
    ALTER COLUMN reference_code SET NOT NULL;

CREATE UNIQUE INDEX ux_tenancies_reference_code
    ON tenancy.tenancies(reference_code);

ALTER TABLE concern.concerns
    ADD COLUMN reference_code VARCHAR(40);

UPDATE concern.concerns
SET reference_code = 'CON-' || EXTRACT(YEAR FROM CURRENT_DATE)::INT || '-' || LPAD(nextval('shared.reference_code_seq')::TEXT, 6, '0')
WHERE reference_code IS NULL;

ALTER TABLE concern.concerns
    ALTER COLUMN reference_code SET NOT NULL;

CREATE UNIQUE INDEX ux_concerns_reference_code
    ON concern.concerns(reference_code);

ALTER TABLE billing.billing_cycles
    ADD COLUMN reference_code VARCHAR(40);

UPDATE billing.billing_cycles
SET reference_code = 'BIL-' || EXTRACT(YEAR FROM CURRENT_DATE)::INT || '-' || LPAD(nextval('shared.reference_code_seq')::TEXT, 6, '0')
WHERE reference_code IS NULL;

ALTER TABLE billing.billing_cycles
    ALTER COLUMN reference_code SET NOT NULL;

CREATE UNIQUE INDEX ux_billing_cycles_reference_code
    ON billing.billing_cycles(reference_code);

ALTER TABLE payment.payment_orders
    ADD COLUMN reference_code VARCHAR(40);

UPDATE payment.payment_orders
SET reference_code = 'PAY-' || EXTRACT(YEAR FROM CURRENT_DATE)::INT || '-' || LPAD(nextval('shared.reference_code_seq')::TEXT, 6, '0')
WHERE reference_code IS NULL;

ALTER TABLE payment.payment_orders
    ALTER COLUMN reference_code SET NOT NULL;

CREATE UNIQUE INDEX ux_payment_orders_reference_code
    ON payment.payment_orders(reference_code);
