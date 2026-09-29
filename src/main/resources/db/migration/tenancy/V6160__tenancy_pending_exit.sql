-- A stay past its checkout date that nobody has ended yet. The bed stays held
-- (is_active stays true) and everything else on the account halts until a
-- person ends it. See docs/superpowers/specs/2026-09-26-pending-exit-design.md.
--
-- Every value V6159 allows is kept, SCHEDULED included.
ALTER TABLE tenancy.tenancies
    DROP CONSTRAINT IF EXISTS chk_tenancies_status;

ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_status
        CHECK (status IN (
            'PENDING_ACCEPTANCE',
            'SCHEDULED',
            'ACTIVE',
            'ON_NOTICE',
            'ON_PREMATURE_NOTICE',
            'PENDING_EXIT',
            'EXITED',
            'EVICTED',
            'CANCELLED'
        ));
