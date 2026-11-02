-- Rooms start from their latest move-in checklist, where one exists
-- (2026-10-29). A room without one starts empty: its next onboarding takes
-- the photos. The room's own amenities are Room items.
INSERT INTO property.room_item_conditions
    (id, room_id, item_key, item_name, section, damage_level, photo_urls, created_at, updated_at, version)
SELECT DISTINCT ON (latest.room_id, lower(trim(i.name)))
       gen_random_uuid(),
       latest.room_id,
       lower(trim(i.name)),
       trim(i.name),
       CASE WHEN i.section = 'BATHROOM' THEN 'BATHROOM' ELSE 'ROOM' END,
       i.damage_level,
       COALESCE(i.photo_urls, '[]'::jsonb),
       now(), now(), 0
FROM (
    SELECT DISTINCT ON (t.room_id) t.room_id, c.tenancy_id
    FROM tenancy.move_in_checklists c
    JOIN tenancy.tenancies t ON t.id = c.tenancy_id
    WHERE t.room_id IS NOT NULL
    ORDER BY t.room_id, c.recorded_at DESC
) latest
JOIN tenancy.move_in_checklist_items i ON i.tenancy_id = latest.tenancy_id
JOIN property.rooms r ON r.id = latest.room_id
ORDER BY latest.room_id, lower(trim(i.name)), i.display_order;
