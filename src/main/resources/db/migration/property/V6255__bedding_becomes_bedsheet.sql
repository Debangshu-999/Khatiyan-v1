-- Bedding is dropped (user, 2026-10-29): it overlapped Bedsheet on the damage
-- list, the one list of what a room can have. Rooms and room types that had it
-- have Bedsheet instead, and the list keeps Bedsheet only. BEDDING stays in
-- the amenity enum, unused, since it was persisted by name.

INSERT INTO property.room_custom_amenities (room_id, name)
SELECT a.room_id, 'Bedsheet' FROM property.room_amenities a
WHERE a.amenity = 'BEDDING'
  AND NOT EXISTS (SELECT 1 FROM property.room_custom_amenities c WHERE c.room_id = a.room_id AND lower(c.name) = 'bedsheet');

INSERT INTO property.room_mold_custom_amenities (mold_id, name)
SELECT a.mold_id, 'Bedsheet' FROM property.room_mold_amenities a
WHERE a.amenity = 'BEDDING'
  AND NOT EXISTS (SELECT 1 FROM property.room_mold_custom_amenities c WHERE c.mold_id = a.mold_id AND lower(c.name) = 'bedsheet');

DELETE FROM property.room_amenities WHERE amenity = 'BEDDING';
DELETE FROM property.room_mold_amenities WHERE amenity = 'BEDDING';

-- A list that had Bedding and no Bedsheet gets Bedsheet in its place, with its prices.
UPDATE property.property_damage_charges c
SET name = 'Bedsheet'
WHERE lower(c.name) = 'bedding'
  AND NOT EXISTS (SELECT 1 FROM property.property_damage_charges o WHERE o.property_id = c.property_id AND lower(o.name) = 'bedsheet');

-- Otherwise Bedding goes, and the list closes up its positions.
WITH gone AS (
    DELETE FROM property.property_damage_charges WHERE lower(name) = 'bedding' RETURNING property_id
),
renumbered AS (
    SELECT c.property_id, c.display_order,
           row_number() OVER (PARTITION BY c.property_id ORDER BY c.display_order) - 1 AS position
    FROM property.property_damage_charges c
    WHERE c.property_id IN (SELECT property_id FROM gone) AND lower(c.name) <> 'bedding'
)
UPDATE property.property_damage_charges c
SET display_order = r.position + 100000
FROM renumbered r
WHERE c.property_id = r.property_id AND c.display_order = r.display_order;

UPDATE property.property_damage_charges SET display_order = display_order - 100000 WHERE display_order >= 100000;
