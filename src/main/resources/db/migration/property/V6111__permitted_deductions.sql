-- What a security deposit may be used for, moved onto the property.
--
-- It used to live inside each agreement's clause set and could be narrowed per
-- tenancy, which produced deeds at one address that disagreed about what a
-- deposit covers. It belongs beside the damage schedule and the move-out
-- checklist: all three answer what happens when a tenant leaves, and an owner
-- should set them on one screen.

CREATE TABLE property.property_permitted_deductions (
    property_id UUID        NOT NULL REFERENCES property.properties (id) ON DELETE CASCADE,
    category    VARCHAR(30) NOT NULL,
    PRIMARY KEY (property_id, category),
    CONSTRAINT property_permitted_deductions_category_check
        CHECK (category IN ('DAMAGE', 'UNPAID_DUES', 'CLEANING', 'UTILITIES'))
);

-- Every existing property gets the three categories the old starter clause
-- seeded, so no property silently loses the deduction rights its agreements
-- already claimed. UTILITIES is new and is left off — nobody agreed to it.
INSERT INTO property.property_permitted_deductions (property_id, category)
SELECT id, category
FROM property.properties
         CROSS JOIN (VALUES ('DAMAGE'), ('UNPAID_DUES'), ('CLEANING')) AS seed (category)
WHERE is_active = TRUE;
