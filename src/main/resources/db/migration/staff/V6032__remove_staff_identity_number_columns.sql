ALTER TABLE property.property_managers
    DROP CONSTRAINT IF EXISTS chk_property_managers_aadhaar_last_four,
    DROP CONSTRAINT IF EXISTS chk_property_managers_pan_last_four,
    DROP COLUMN IF EXISTS aadhaar_last_four,
    DROP COLUMN IF EXISTS pan_last_four;

ALTER TABLE staff.staff_members
    DROP CONSTRAINT IF EXISTS chk_staff_members_aadhaar_last_four,
    DROP CONSTRAINT IF EXISTS chk_staff_members_pan_last_four,
    DROP COLUMN IF EXISTS aadhaar_last_four,
    DROP COLUMN IF EXISTS pan_last_four;