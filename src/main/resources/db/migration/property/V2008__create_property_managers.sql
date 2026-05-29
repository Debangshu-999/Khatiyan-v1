CREATE TABLE IF NOT EXISTS property.property_managers (
    id UUID PRIMARY KEY,

    property_id UUID NOT NULL,
    manager_user_id UUID NOT NULL,
    assigned_by_user_id UUID NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_property_managers_property
        FOREIGN KEY (property_id)
        REFERENCES property.properties (id)
);

CREATE INDEX IF NOT EXISTS idx_property_managers_property_active
    ON property.property_managers (property_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_property_managers_manager_active
    ON property.property_managers (manager_user_id)
    WHERE is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS ux_property_managers_property_manager_active
    ON property.property_managers (property_id, manager_user_id)
    WHERE is_active = TRUE;
