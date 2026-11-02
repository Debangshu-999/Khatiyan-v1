-- A room keeps a running condition for each of its items (user, 2026-10-29):
-- the level and photos its first move-in checklist set, raised by a damage
-- record, reset by a repair. The next onboarding starts from it.
CREATE TABLE property.room_item_conditions (
    id           uuid         PRIMARY KEY,
    room_id      uuid         NOT NULL REFERENCES property.rooms(id) ON DELETE CASCADE,
    item_key     varchar(80)  NOT NULL,
    item_name    varchar(80)  NOT NULL,
    section      varchar(10)  NOT NULL,
    damage_level varchar(4)   NOT NULL,
    photo_urls   jsonb        NOT NULL DEFAULT '[]'::jsonb,
    updated_by   uuid,
    created_at   timestamptz  NOT NULL,
    updated_at   timestamptz  NOT NULL,
    version      bigint       NOT NULL DEFAULT 0,
    CONSTRAINT uq_room_item_condition UNIQUE (room_id, item_key),
    CONSTRAINT chk_room_item_section CHECK (section IN ('ROOM', 'BATHROOM')),
    CONSTRAINT chk_room_item_level CHECK (damage_level IN ('NA', 'D1', 'D2', 'D3'))
);
