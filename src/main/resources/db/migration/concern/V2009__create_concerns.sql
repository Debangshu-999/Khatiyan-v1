CREATE SCHEMA IF NOT EXISTS concern;

CREATE TABLE concern.concerns (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    room_id UUID NOT NULL,
    tenancy_id UUID NOT NULL,
    raised_by_user_id UUID NOT NULL,
    assigned_to_user_id UUID,
    resolved_by_user_id UUID,

    category VARCHAR(40) NOT NULL,
    priority VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL,

    title VARCHAR(160) NOT NULL,
    description VARCHAR(1000) NOT NULL,
    resolution_note VARCHAR(1000),

    resolved_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE concern.concern_photos (
    id UUID PRIMARY KEY,
    concern_id UUID NOT NULL,
    photo_url VARCHAR(500) NOT NULL,
    photo_public_id VARCHAR(200),
    display_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_concern_photos_concern
        FOREIGN KEY (concern_id)
        REFERENCES concern.concerns (id)
        ON DELETE CASCADE,

    CONSTRAINT chk_concern_photos_display_order
        CHECK (display_order >= 0 AND display_order < 4)
);

CREATE INDEX idx_concern_photos_concern
    ON concern.concern_photos (concern_id, display_order);


CREATE INDEX idx_concerns_property_status
    ON concern.concerns (property_id, status)
    WHERE is_active = TRUE;

CREATE INDEX idx_concerns_raised_by_status
    ON concern.concerns (raised_by_user_id, status)
    WHERE is_active = TRUE;

CREATE INDEX idx_concerns_tenancy
    ON concern.concerns (tenancy_id);

CREATE INDEX idx_concerns_assigned_to_status
    ON concern.concerns (assigned_to_user_id, status)
    WHERE is_active = TRUE AND assigned_to_user_id IS NOT NULL;
