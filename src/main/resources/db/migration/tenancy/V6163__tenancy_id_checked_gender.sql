-- The gender the owner confirmed when they checked the tenant's ID (owner's
-- rule, 2026-09-27: gender is verified on every manual check). Recorded with
-- the document type and last four digits it was checked alongside.
--
-- Nullable, and deliberately NOT added to chk_tenancies_id_check_complete:
-- declarations made before today have no gender, and Postgres checks even a
-- NOT VALID constraint on every UPDATE, so requiring it there would make every
-- older stay impossible to end or change. The app and the entity require it on
-- new declarations instead.
ALTER TABLE tenancy.tenancies
    ADD COLUMN id_checked_gender VARCHAR(20);

-- A declaration names a gender. UNDECLARED is an answer an account may give,
-- not one an ID check can record.
ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_id_checked_gender
        CHECK (id_checked_gender IS NULL OR id_checked_gender IN ('MALE', 'FEMALE', 'TRANSGENDER', 'OTHER'));
