-- A future booking claims one approved outgoing room change, without taking
-- physical occupancy before that move executes. The source may back only one
-- open tenancy, even when two owners submit at the same time.
ALTER TABLE tenancy.tenancies
    ADD COLUMN future_vacancy_source_id UUID;

ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT fk_tenancies_future_vacancy_source
        FOREIGN KEY (future_vacancy_source_id)
        REFERENCES tenancy.tenancy_room_change_requests (id);

CREATE UNIQUE INDEX uk_tenancies_active_future_vacancy_source
    ON tenancy.tenancies (future_vacancy_source_id)
    WHERE is_active = TRUE AND future_vacancy_source_id IS NOT NULL;

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
            'EXITED',
            'EVICTED',
            'CANCELLED'
        ));
