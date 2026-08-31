-- Identity details an agreement names a party by.
--
-- On users rather than on a tenancy because every role needs them: the deed
-- names both parties by their permanent address, and the Landlord is an owner,
-- not a tenant.
--
-- All nullable. Existing accounts have none of these, and NOT NULL here would
-- mean either inventing values or locking every current user out of their own
-- profile screen. Onboarding enforces its own requirements instead.
--
-- Deliberately NOT added: PAN and Aadhaar. Aadhaar cannot be required by a
-- private landlord (s.57 of the Aadhaar Act, struck down in Puttaswamy), and PAN
-- appears on a flat deed only because that deed is stamped and registered — a PG
-- bed licence is neither. Storing it would have bought an encryption-at-rest and
-- purpose-limitation obligation for a column nothing reads.

ALTER TABLE auth.users
    ADD COLUMN permanent_address VARCHAR(300),
    ADD COLUMN permanent_address_pincode CHAR(6),
    -- A birth date, never an age: an age is wrong within a year and wrong on
    -- every agreement issued after that. The deed computes it at assembly.
    ADD COLUMN date_of_birth DATE,
    ADD COLUMN gender VARCHAR(20);

ALTER TABLE auth.users
    ADD CONSTRAINT users_gender_check
        CHECK (gender IS NULL OR gender IN ('MALE', 'FEMALE', 'OTHER'));

ALTER TABLE auth.users
    ADD CONSTRAINT users_permanent_address_pincode_check
        CHECK (permanent_address_pincode IS NULL OR permanent_address_pincode ~ '^[0-9]{6}$');
