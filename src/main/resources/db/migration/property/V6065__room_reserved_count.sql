-- Beds held for an approved room change that has not reached its transfer date.
--
-- Approving a room change previously reserved nothing: the bed stayed free until
-- the scheduler executed the move, so anything could take it in between. The
-- executor re-checks availability and throws, which meant an approved move could
-- fail silently from a background job on transfer day.
--
-- There is no bed entity — occupancy is a count against room capacity — so a
-- reservation is a second count. Availability is now
-- capacity - occupied_count - reserved_count.
ALTER TABLE property.rooms
    ADD COLUMN reserved_count INT NOT NULL DEFAULT 0;

ALTER TABLE property.rooms
    ADD CONSTRAINT chk_rooms_reserved_count_non_negative
        CHECK (reserved_count >= 0);

-- The invariant the application relies on: a room can never promise more beds
-- than it has, counting held ones.
ALTER TABLE property.rooms
    ADD CONSTRAINT chk_rooms_occupancy_within_capacity
        CHECK (occupied_count + reserved_count <= capacity);
