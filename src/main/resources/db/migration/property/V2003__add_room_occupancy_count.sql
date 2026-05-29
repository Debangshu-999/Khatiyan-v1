ALTER TABLE property.rooms
    ADD COLUMN IF NOT EXISTS occupied_count INTEGER NOT NULL DEFAULT 0;

UPDATE property.rooms r
SET occupied_count = active_tenancies.active_count
FROM (
    SELECT room_id, COUNT(*)::INTEGER AS active_count
    FROM tenancy.tenancies
    WHERE is_active = TRUE
    GROUP BY room_id
) active_tenancies
WHERE r.id = active_tenancies.room_id;

UPDATE property.rooms
SET status = CASE
    WHEN occupied_count <= 0 THEN 'VACANT'
    WHEN occupied_count >= capacity THEN 'OCCUPIED'
    ELSE 'PARTIALLY_OCCUPIED'
END
WHERE status <> 'MAINTENANCE';

ALTER TABLE property.rooms
    ADD CONSTRAINT ck_rooms_occupied_count_valid
        CHECK (occupied_count >= 0 AND occupied_count <= capacity);
