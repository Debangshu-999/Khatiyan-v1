-- Explicit, actor-configured tenancy exits. Approval alone never schedules an
-- exit. A completed or reversed schedule is retained as an audit record and
-- removed only from the active execution queue.

CREATE TABLE tenancy.property_exit_schedule_settings (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    execution_time TIME NOT NULL DEFAULT TIME '00:10:00',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_property_exit_schedule_settings_property UNIQUE (property_id),
    CONSTRAINT fk_property_exit_schedule_settings_property
        FOREIGN KEY (property_id) REFERENCES property.properties (id)
);

CREATE TABLE tenancy.scheduled_tenancy_exits (
    id UUID PRIMARY KEY,
    tenancy_id UUID NOT NULL,
    exit_request_id UUID NOT NULL,
    property_id UUID NOT NULL,
    tenant_user_id UUID NOT NULL,
    scheduled_checkout_date DATE NOT NULL,
    execution_payload TEXT NOT NULL,
    configured_by_user_id UUID NOT NULL,
    next_attempt_at TIMESTAMPTZ NOT NULL,
    last_attempt_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_failure_code VARCHAR(40),
    last_failure_message VARCHAR(500),
    status VARCHAR(24) NOT NULL DEFAULT 'SCHEDULED',
    closed_at TIMESTAMPTZ,
    closure_reason VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_scheduled_tenancy_exits_tenancy
        FOREIGN KEY (tenancy_id) REFERENCES tenancy.tenancies (id),
    CONSTRAINT fk_scheduled_tenancy_exits_request
        FOREIGN KEY (exit_request_id) REFERENCES tenancy.tenancy_exit_requests (id),
    CONSTRAINT fk_scheduled_tenancy_exits_property
        FOREIGN KEY (property_id) REFERENCES property.properties (id),
    CONSTRAINT chk_scheduled_tenancy_exits_attempt_count CHECK (attempt_count >= 0),
    CONSTRAINT chk_scheduled_tenancy_exits_status
        CHECK (status IN ('SCHEDULED', 'COMPLETED', 'REVERSED', 'UNSCHEDULED'))
);

CREATE INDEX idx_scheduled_tenancy_exits_due
    ON tenancy.scheduled_tenancy_exits (next_attempt_at)
    WHERE status = 'SCHEDULED';

CREATE INDEX idx_scheduled_tenancy_exits_property_checkout
    ON tenancy.scheduled_tenancy_exits (property_id, scheduled_checkout_date);

CREATE UNIQUE INDEX uk_scheduled_tenancy_exits_one_active_tenancy
    ON tenancy.scheduled_tenancy_exits (tenancy_id)
    WHERE status = 'SCHEDULED';

CREATE UNIQUE INDEX uk_scheduled_tenancy_exits_one_active_request
    ON tenancy.scheduled_tenancy_exits (exit_request_id)
    WHERE status = 'SCHEDULED';
