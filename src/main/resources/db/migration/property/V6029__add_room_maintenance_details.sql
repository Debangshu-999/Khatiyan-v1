ALTER TABLE property.rooms
    ADD COLUMN maintenance_reason VARCHAR(280),
    ADD COLUMN maintenance_until TIMESTAMPTZ,
    ADD COLUMN maintenance_marked_by UUID,
    ADD COLUMN maintenance_marked_at TIMESTAMPTZ;
