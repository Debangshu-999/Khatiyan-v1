-- Rent grace drops from a 30-day ceiling to 10.
--
-- Thirty days was never realistic — it let the payment window span an entire
-- cycle, which is also the window an exit request may be raised in. A grace that
-- wide breaks the assumption the notice-period design rests on: that a request
-- always arrives near the start of a cycle.
--
-- Existing data is well inside the new bound (properties: 2, 2, 3; cycles: 0, 3),
-- so this tightens the constraint without touching a row.
--
-- billing_cycles keeps its own copy because each cycle stores the policy it was
-- generated under; historical cycles must stay valid, which they are.

ALTER TABLE property.properties
    DROP CONSTRAINT IF EXISTS chk_properties_rent_grace_days;

ALTER TABLE property.properties
    ADD CONSTRAINT chk_properties_rent_grace_days
        CHECK (rent_grace_days BETWEEN 0 AND 10);

ALTER TABLE billing.billing_cycles
    DROP CONSTRAINT IF EXISTS chk_billing_cycles_rent_grace_days;

ALTER TABLE billing.billing_cycles
    ADD CONSTRAINT chk_billing_cycles_rent_grace_days
        CHECK (rent_grace_days BETWEEN 0 AND 10);
