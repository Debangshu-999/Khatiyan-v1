-- Property exit policies: the damage-charge schedule and the move-out checklist.
-- Both are ordered @ElementCollection lists (order stored in display_order).

CREATE TABLE property.property_damage_charges (
    property_id UUID NOT NULL REFERENCES property.properties(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL,
    name VARCHAR(80) NOT NULL,
    charge_paise BIGINT NOT NULL,
    PRIMARY KEY (property_id, display_order)
);

CREATE TABLE property.property_exit_checklist_items (
    property_id UUID NOT NULL REFERENCES property.properties(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL,
    label VARCHAR(120) NOT NULL,
    PRIMARY KEY (property_id, display_order)
);

-- Backfill the default move-out checklist onto every existing property so the
-- checklist is never empty. Owners can override it under exit policies.
INSERT INTO property.property_exit_checklist_items (property_id, display_order, label)
SELECT id, 0, 'Keys returned' FROM property.properties
UNION ALL
SELECT id, 1, 'Dues cleared' FROM property.properties
UNION ALL
SELECT id, 2, 'Final inspection completed' FROM property.properties;
