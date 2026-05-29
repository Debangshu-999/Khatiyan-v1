CREATE TABLE notice.recurring_notices (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    created_by_user_id UUID NOT NULL,

    title VARCHAR(160) NOT NULL,
    body VARCHAR(2000) NOT NULL,
    priority VARCHAR(20) NOT NULL,

    frequency VARCHAR(20) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,

    active_from DATE,
    active_until DATE,
    last_generated_for_date DATE,

    status VARCHAR(20) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_recurring_notice_time_window
        CHECK (end_time > start_time)
);

CREATE INDEX idx_recurring_notices_property_status
    ON notice.recurring_notices (property_id, status, created_at DESC);

CREATE INDEX idx_recurring_notices_generation
    ON notice.recurring_notices (status, last_generated_for_date);
