-- The owner's declaration that they checked the tenant's government photo ID
-- before onboarding them.
--
-- Khatiyan does not verify identity and holds no ID document. Most states make
-- tenant ID verification and police notification the landlord's legal duty
-- (Section 188 IPC exposure), so this records *their* declaration, with who made
-- it and when — evidence of their compliance, not a claim by us.
--
-- Nullable on purpose: tenancies created before this existed genuinely have no
-- declaration, and defaulting them to true would fabricate a compliance claim
-- nobody made.
ALTER TABLE tenancy.tenancies
    ADD COLUMN id_check_confirmed BOOLEAN,
    ADD COLUMN id_check_document_type VARCHAR(24),
    ADD COLUMN id_checked_by_user_id UUID,
    ADD COLUMN id_checked_at TIMESTAMPTZ;

ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_id_check_document_type CHECK (
        id_check_document_type IS NULL OR id_check_document_type IN (
            'AADHAAR',
            'PASSPORT',
            'DRIVING_LICENCE',
            'VOTER_ID',
            'OTHER'
        )
    );
