-- An existing tenant's owner may declare that they verified the tenant's
-- identity before Khatiyan, instead of checking an ID or ordering a check now
-- (existing-tenant onboarding, user, 2026-10-28). That declaration is its own
-- kind of attestation: it is about a check made in the past, not one made here.

ALTER TABLE compliance.attestations
    DROP CONSTRAINT ck_attestations_kind;

ALTER TABLE compliance.attestations
    ADD CONSTRAINT ck_attestations_kind CHECK (kind IN (
        'TENANCY_AGREEMENT_ACCEPTANCE',
        'TENANT_ID_DECLARATION',
        'EXISTING_TENANT_VERIFIED_DECLARATION'
    ));
