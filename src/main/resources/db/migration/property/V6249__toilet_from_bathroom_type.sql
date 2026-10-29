-- A room's toilet follows its property's bathroom type, never a tick (user,
-- 2026-10-29): ATTACHED_TOILET where bathrooms are attached, COMMON_TOILET
-- where they are common. Every room type and room is set from it here; the
-- app keeps it so from now on.

DELETE FROM property.room_mold_amenities WHERE amenity IN ('ATTACHED_TOILET', 'COMMON_TOILET');
INSERT INTO property.room_mold_amenities (mold_id, amenity)
SELECT m.id, CASE p.bathroom_type WHEN 'COMMON' THEN 'COMMON_TOILET' ELSE 'ATTACHED_TOILET' END
FROM property.room_molds m
JOIN property.properties p ON p.id = m.property_id;

DELETE FROM property.room_amenities WHERE amenity IN ('ATTACHED_TOILET', 'COMMON_TOILET');
INSERT INTO property.room_amenities (room_id, amenity)
SELECT r.id, CASE p.bathroom_type WHEN 'COMMON' THEN 'COMMON_TOILET' ELSE 'ATTACHED_TOILET' END
FROM property.rooms r
JOIN property.properties p ON p.id = r.property_id;
