DROP INDEX IF EXISTS property.idx_rooms_property_id;
DROP INDEX IF EXISTS property.idx_rooms_property_status;

CREATE INDEX IF NOT EXISTS idx_active_rooms_property
    ON property.rooms (property_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_active_rooms_property_status
    ON property.rooms (property_id, status)
    WHERE is_active = TRUE;
