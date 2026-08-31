-- Removes FIVE_SHARING.
--
-- Occupancy is now 1–4 and then DORMITORY, which covers everything larger.
--
-- Deleting a persisted enum constant is normally forbidden here — a signed
-- agreement or a live row referring to it would 500 on every read afterwards.
-- This one is safe, and only because it was checked: no room and no mold uses
-- it. The single row that did was one property's *claim* to offer five-sharing,
-- in a table that is already redundant with the molds and that has no rooms
-- behind the claim.
--
-- The claim is deleted rather than migrated. Rewriting it to DORMITORY would
-- invent a fact — a five-share and a dormitory are not the same product — and
-- the property can add a dormitory mold if that is what it meant.
DELETE FROM property.property_available_sharing_types
WHERE sharing_type = 'FIVE_SHARING';

-- And the mold constraint stops accepting it, so it cannot come back through
-- the one table that would otherwise still take it.
ALTER TABLE property.room_molds
    DROP CONSTRAINT ck_room_molds_sharing_type;

ALTER TABLE property.room_molds
    ADD CONSTRAINT ck_room_molds_sharing_type CHECK (sharing_type IN (
        'SINGLE', 'DOUBLE', 'TRIPLE', 'FOUR_SHARING', 'DORMITORY'
    ));
