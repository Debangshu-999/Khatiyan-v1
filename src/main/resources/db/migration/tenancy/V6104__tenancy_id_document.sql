-- Which government ID the owner checked, and the last four digits of it.
--
-- Reinstates the document type dropped by V6064, which removed it on the
-- reasoning that it "tells us nothing we act on". That was true while the
-- declaration was a bare boolean. It stops being true once the declaration has
-- to stand up as evidence: "I checked their ID" is not a checkable statement,
-- while "I checked a passport ending 4417" is one the tenant can confirm or
-- contradict.
--
-- Four digits and no more. Enough to tie the declaration to a specific document
-- without holding an identifier that can be used to impersonate anybody, and it
-- is the fragment UIDAI's own masking convention leaves visible.
--
-- NOT Aadhaar-only, and that is a legal constraint rather than a preference. A
-- private landlord cannot require Aadhaar for a tenancy — s.57 of the Aadhaar
-- Act was struck down in Puttaswamy — so the field has to accept whichever
-- government photo ID was actually produced.
ALTER TABLE tenancy.tenancies
    ADD COLUMN id_document_type VARCHAR(24),
    ADD COLUMN id_last_four     VARCHAR(4);

ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_id_document_type CHECK (
        id_document_type IS NULL OR id_document_type IN (
            'AADHAAR',
            'PASSPORT',
            'DRIVING_LICENCE',
            'VOTER_ID',
            'PAN',
            'OTHER'
        )
    );

-- Exactly four digits when present. A partially filled box is a typo, and a
-- typo in the one field that identifies the document defeats the point of it.
ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_id_last_four CHECK (
        id_last_four IS NULL OR id_last_four ~ '^[0-9]{4}$'
    );

-- The declaration is now three facts that stand or fall together: it was made,
-- against a named document type, ending in known digits. Recording one without
-- the others leaves a claim nobody can check.
--
-- NOT VALID, so declarations made before those particulars were collected are
-- left alone. Postgres still enforces this on every insert and update; it only
-- skips the existing rows. Back-filling them instead would mean inventing a
-- document type for a check somebody made without recording one — the same
-- reason V6063 made the original column nullable rather than defaulting it.
ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_id_check_complete CHECK (
        id_check_confirmed IS NOT TRUE
        OR (id_document_type IS NOT NULL AND id_last_four IS NOT NULL)
    ) NOT VALID;
