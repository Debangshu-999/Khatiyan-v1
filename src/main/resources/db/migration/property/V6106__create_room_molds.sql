-- Room molds: the shape a room is cut from.
--
-- A mold is one sharing type in one conditioning variant — "Triple sharing, AC"
-- — carrying the bed count, a default rent and a default amenity set. Rooms are
-- created FROM a mold and then diverge: rent and amenities are editable per
-- room, and editing the mold afterwards does not reach back into rooms already
-- made. It is a template, not a parent.
--
-- Why this exists: `rooms.capacity` was a free integer sitting beside a
-- `room_type` that claimed a sharing size, so a DOUBLE room with capacity 5 was
-- representable and nothing objected. Bed count now comes from the mold.
CREATE TABLE property.room_molds (
    id               UUID PRIMARY KEY,
    property_id      UUID NOT NULL REFERENCES property.properties (id),

    sharing_type     VARCHAR(30) NOT NULL,

    -- AC-ness is the variant axis, never an amenity. RoomType's own comment has
    -- said so since it was written: modelling it separately is what avoids enum
    -- combinations like DOUBLE_AC. The amenity list shows it ticked and locked,
    -- derived from this column rather than stored twice where the two could
    -- disagree.
    conditioning     VARCHAR(20) NOT NULL,

    -- Fixed by the sharing type for SINGLE..FIVE; entered by the owner for
    -- DORMITORY. Kept on the mold rather than derived from the type so that
    -- "6-bed dorm" and "10-bed dorm" are simply two molds — which they must be,
    -- because they do not rent for the same money.
    bed_count        INT NOT NULL CHECK (bed_count >= 1),

    base_rent_paise  BIGINT NOT NULL CHECK (base_rent_paise >= 0),

    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_room_molds_sharing_type CHECK (sharing_type IN (
        'SINGLE', 'DOUBLE', 'TRIPLE', 'FOUR_SHARING', 'FIVE_SHARING', 'DORMITORY'
    )),
    CONSTRAINT ck_room_molds_conditioning CHECK (conditioning IN ('AC', 'NON_AC'))
);

-- One mold per shape. Bed count is part of the key so a property can offer two
-- dorm sizes; for the fixed types it is implied by the sharing type and adds
-- nothing to the uniqueness.
CREATE UNIQUE INDEX ux_room_molds_shape
    ON property.room_molds (property_id, sharing_type, conditioning, bed_count);

CREATE INDEX ix_room_molds_property ON property.room_molds (property_id, is_active);

-- The mold's default amenities, and the owner's own additions. Same two-table
-- shape as property_facilities / property_custom_facilities, deliberately: this
-- is the same idea one level down, and a reader who knows one knows the other.
CREATE TABLE property.room_mold_amenities (
    mold_id UUID NOT NULL REFERENCES property.room_molds (id) ON DELETE CASCADE,
    amenity VARCHAR(40) NOT NULL,
    CONSTRAINT pk_room_mold_amenities PRIMARY KEY (mold_id, amenity)
);

CREATE TABLE property.room_mold_custom_amenities (
    mold_id UUID NOT NULL REFERENCES property.room_molds (id) ON DELETE CASCADE,
    name    VARCHAR(80) NOT NULL,
    CONSTRAINT pk_room_mold_custom_amenities PRIMARY KEY (mold_id, name)
);

-- Rooms carry their own copies, because they are allowed to differ from the
-- mold they came from. Without these a room could only ever show the mold's
-- list, and "editable per room" would be a promise the schema could not keep.
CREATE TABLE property.room_amenities (
    room_id UUID NOT NULL REFERENCES property.rooms (id) ON DELETE CASCADE,
    amenity VARCHAR(40) NOT NULL,
    CONSTRAINT pk_room_amenities PRIMARY KEY (room_id, amenity)
);

CREATE TABLE property.room_custom_amenities (
    room_id UUID NOT NULL REFERENCES property.rooms (id) ON DELETE CASCADE,
    name    VARCHAR(80) NOT NULL,
    CONSTRAINT pk_room_custom_amenities PRIMARY KEY (room_id, name)
);

-- Nullable, and it stays nullable. The backfill below gives every existing room
-- a mold, but a room whose mold is later deleted must not take the room with
-- it — the room is real and occupied; the template is bookkeeping.
ALTER TABLE property.rooms
    ADD COLUMN mold_id UUID REFERENCES property.room_molds (id) ON DELETE SET NULL;

CREATE INDEX ix_rooms_mold ON property.rooms (mold_id);
