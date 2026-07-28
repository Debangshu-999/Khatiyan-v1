-- V6046 added PENDING_ACCEPTANCE and CANCELLED to the TenancyStatus enum, but the
-- chk_tenancies_status CHECK constraint (last set in V4008) still only allowed the
-- original five values — so every agreement-path tenancy (inserted as
-- PENDING_ACCEPTANCE) was rejected by Postgres. Widen the constraint to the full
-- current status set.
ALTER TABLE tenancy.tenancies
    DROP CONSTRAINT IF EXISTS chk_tenancies_status;

ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_status
        CHECK (status IN (
            'PENDING_ACCEPTANCE',
            'ACTIVE',
            'ON_NOTICE',
            'ON_PREMATURE_NOTICE',
            'EXITED',
            'EVICTED',
            'CANCELLED'
        ));
