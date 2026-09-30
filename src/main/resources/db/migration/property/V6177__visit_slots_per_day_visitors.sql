-- Visitor capacity belongs to a weekday, not to the whole property.
-- Existing properties keep their configured capacity on every saved slot.

ALTER TABLE property.property_visit_slots
    ADD COLUMN visitors_per_slot INTEGER;

UPDATE property.property_visit_slots slot
SET visitors_per_slot = settings.visitors_per_slot
FROM property.property_visit_settings settings
WHERE settings.id = slot.settings_id;

ALTER TABLE property.property_visit_slots
    ALTER COLUMN visitors_per_slot SET NOT NULL,
    ADD CONSTRAINT chk_property_visit_slots_visitors
        CHECK (visitors_per_slot BETWEEN 1 AND 50);

ALTER TABLE property.property_visit_settings
    DROP CONSTRAINT chk_property_visit_settings_visitors,
    DROP COLUMN visitors_per_slot;
