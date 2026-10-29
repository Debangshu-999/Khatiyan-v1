-- Move-in photos belong to each item, not the room as a whole (user,
-- 2026-10-29): 1 to 3 per item, required. A checklist already recorded gives
-- each of its items the first room photo it had.

ALTER TABLE tenancy.move_in_checklist_items
    ADD COLUMN photo_urls jsonb;

UPDATE tenancy.move_in_checklist_items i
SET photo_urls = jsonb_build_array(c.photo_urls -> 0)
FROM tenancy.move_in_checklists c
WHERE c.tenancy_id = i.tenancy_id;

ALTER TABLE tenancy.move_in_checklist_items
    ALTER COLUMN photo_urls SET NOT NULL,
    ADD CONSTRAINT chk_move_in_item_photos CHECK (
        CASE WHEN jsonb_typeof(photo_urls) = 'array'
             THEN jsonb_array_length(photo_urls) BETWEEN 1 AND 3
             ELSE false END);

ALTER TABLE tenancy.move_in_checklists
    DROP CONSTRAINT chk_move_in_photos,
    DROP COLUMN photo_urls;
