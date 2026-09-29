-- A future booking may also claim the bed of a stay that is certain to end:
-- an approved exit past its withdrawal window, or a fixed term. The bed frees
-- only when a person ends that stay, so the booking waits for it.
ALTER TABLE tenancy.tenancies
    ADD COLUMN future_vacancy_tenancy_id UUID;

ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT fk_tenancies_future_vacancy_tenancy
        FOREIGN KEY (future_vacancy_tenancy_id)
        REFERENCES tenancy.tenancies (id);

-- One live booking per departing stay, the same guard V6159 gives a room change.
CREATE UNIQUE INDEX uk_tenancies_active_future_vacancy_tenancy
    ON tenancy.tenancies (future_vacancy_tenancy_id)
    WHERE is_active = TRUE AND future_vacancy_tenancy_id IS NOT NULL;

-- A booking waits on exactly one departure.
ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_one_future_vacancy_source
        CHECK (future_vacancy_source_id IS NULL OR future_vacancy_tenancy_id IS NULL);

-- When a signed booking was first found unable to start (its bed not yet
-- free). Set once: it is what notifies management once and what puts the
-- booking on the action center until it starts or is cancelled.
ALTER TABLE tenancy.tenancies
    ADD COLUMN start_blocked_at TIMESTAMPTZ;
