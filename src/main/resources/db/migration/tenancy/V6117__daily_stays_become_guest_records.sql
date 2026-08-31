-- Daily stays stop creating accounts.
--
-- Somebody staying two nights has no reason to install an app, set a PIN and
-- keep a login they will never open again. A daily stay is therefore entirely
-- management-side from here on: the owner raises the bill and marks it paid,
-- and anything else a guest needs — a concern, a request, a repair — is handled
-- in person, the way it already was.
--
-- So the guest's details live on the tenancy row itself, the way a hotel
-- register holds them, rather than on an auth.users row nobody signs into.
-- Monthly tenancies are untouched: that tenant signs an agreement, is billed
-- every month and uses the app for the length of the stay, so they keep a real
-- account.
--
-- Existing daily tenancies keep their user_id and keep working. Their bills,
-- notifications and chat threads already point at those users, and nulling the
-- column would orphan every one of them.

ALTER TABLE tenancy.tenancies
    ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE tenancy.tenancies
    ADD COLUMN guest_name    VARCHAR(120),
    ADD COLUMN guest_phone   VARCHAR(20),
    ADD COLUMN guest_email   VARCHAR(255),
    ADD COLUMN guest_address TEXT,
    ADD COLUMN guest_age     SMALLINT,
    ADD COLUMN guest_gender  VARCHAR(20);

-- A stay is either account-backed or guest-recorded. Never neither: something
-- has to name the person occupying the bed.
ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT tenancies_identity_present
        CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL);

-- The register is all-or-nothing. Email is the one field an owner may leave
-- blank — a walk-in guest often has no reason to give one, and unlike the rest
-- it is not what identifies them.
ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT tenancies_guest_details_complete
        CHECK (
            guest_name IS NULL
            OR (
                guest_phone IS NOT NULL
                AND guest_address IS NOT NULL
                AND guest_age IS NOT NULL
                AND guest_gender IS NOT NULL
            )
        );

-- Age, not date of birth. A guest register records what was stated at check-in
-- and is never read again, so a snapshot is the honest shape for it — a stored
-- DOB would imply the app tracks a birthday it has no business tracking.
ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT tenancies_guest_age_range
        CHECK (guest_age IS NULL OR (guest_age >= 18 AND guest_age <= 120));

-- Same five values as auth.users after V6116, for the same reason: NALSA (2014)
-- requires a third option on an official record, and UNDECLARED is a deliberate
-- answer rather than the absence of one.
ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT tenancies_guest_gender_check
        CHECK (
            guest_gender IS NULL
            OR guest_gender IN ('MALE', 'FEMALE', 'TRANSGENDER', 'OTHER', 'UNDECLARED')
        );

-- The owner's own listing of who is staying, so a guest can be found by the
-- number they gave without scanning the table.
CREATE INDEX idx_tenancies_guest_phone
    ON tenancy.tenancies (property_id, guest_phone)
    WHERE guest_phone IS NOT NULL;
