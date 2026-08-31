-- Gives every existing room a mold, derived from what the room already is.
--
-- One mold per shape that actually occurs — not one per sharing type the
-- property claims to offer. `property_available_sharing_types` is maintained
-- separately from the rooms and can disagree with them; the rooms are the
-- facts, so they are what this reads.
--
-- Rent for the mold is the MEDIAN of the rooms it will own, not the average: a
-- single mispriced room drags a mean and would leave the default wrong for
-- every room created afterwards. Bed count comes from the room's own capacity,
-- which for a dormitory is the only place the real number was ever recorded.
INSERT INTO property.room_molds (id, property_id, sharing_type, conditioning, bed_count, base_rent_paise)
SELECT
    gen_random_uuid(),
    room.property_id,
    room.room_type,
    room.conditioning,
    room.capacity,
    (percentile_disc(0.5) WITHIN GROUP (ORDER BY room.base_rent_paise))::BIGINT
FROM property.rooms AS room
GROUP BY room.property_id, room.room_type, room.conditioning, room.capacity;

UPDATE property.rooms AS room
SET mold_id = mold.id
FROM property.room_molds AS mold
WHERE mold.property_id = room.property_id
  AND mold.sharing_type = room.room_type
  AND mold.conditioning = room.conditioning
  AND mold.bed_count = room.capacity;

-- Every amenity ticked, on both the mold and the rooms.
--
-- A deliberate over-statement, and the alternative is worse. Nothing was ever
-- recorded about these rooms, so any answer is invented; ticking them all
-- matches how these properties are actually let and leaves an owner deleting
-- the two that do not apply rather than re-entering the four that do.
--
-- AC is absent by design. It is the mold's variant, and a row here would be the
-- same fact written twice in two places that can drift apart.
INSERT INTO property.room_mold_amenities (mold_id, amenity)
SELECT mold.id, amenity
FROM property.room_molds AS mold
CROSS JOIN (VALUES ('CUPBOARD'), ('ATTACHED_TOILET'), ('TV'), ('GEYSER'), ('BEDDING')) AS defaults(amenity);

INSERT INTO property.room_amenities (room_id, amenity)
SELECT room.id, amenity
FROM property.rooms AS room
CROSS JOIN (VALUES ('CUPBOARD'), ('ATTACHED_TOILET'), ('TV'), ('GEYSER'), ('BEDDING')) AS defaults(amenity);
