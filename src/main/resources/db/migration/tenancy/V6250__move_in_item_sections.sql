-- Move-in checklist items sit in a section (user, 2026-10-29): ROOM (basic
-- things and anything added by hand, removable), AMENITY (the room's own, not
-- removable) or BATHROOM (things in an attached bathroom, like the geyser).

ALTER TABLE tenancy.move_in_checklist_items
    ADD COLUMN section varchar(10) NOT NULL DEFAULT 'ROOM',
    ADD CONSTRAINT chk_move_in_item_section CHECK (section IN ('ROOM', 'AMENITY', 'BATHROOM'));
