-- Damage charges by category, priced at one to three levels (user,
-- 2026-10-29). D1 always; D2 and D3 only when priced, D3 never without D2,
-- each at least the one before. charge_paise stays the highest priced level.
-- Category is the move-in checklist's sections: ROOM, AMENITY, BATHROOM.

ALTER TABLE property.property_damage_charges
    DROP CONSTRAINT chk_damage_charge_levels,
    ALTER COLUMN d2_paise DROP NOT NULL,
    ALTER COLUMN d3_paise DROP NOT NULL,
    ADD COLUMN category varchar(10) NOT NULL DEFAULT 'ROOM',
    ADD CONSTRAINT chk_damage_charge_levels CHECK (
        d1_paise >= 0
        AND (d2_paise IS NULL OR d2_paise >= d1_paise)
        AND (d3_paise IS NULL OR (d2_paise IS NOT NULL AND d3_paise >= d2_paise))),
    ADD CONSTRAINT chk_damage_charge_category CHECK (category IN ('ROOM', 'AMENITY', 'BATHROOM'));

-- What the existing items are, by their names.
UPDATE property.property_damage_charges
SET category = 'BATHROOM'
WHERE lower(name) IN ('taps', 'tap', 'shower', 'wash basin', 'mirror', 'bucket', 'mug', 'geyser');

UPDATE property.property_damage_charges
SET category = 'AMENITY'
WHERE lower(name) IN ('cupboard', 'tv', 'bedding', 'ac');
