CREATE SCHEMA IF NOT EXISTS property;

CREATE TABLE property.properties (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    address VARCHAR(300) NOT NULL,
    city VARCHAR(80) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    type VARCHAR(20) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE property.rooms (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    room_number VARCHAR(40) NOT NULL,
    floor VARCHAR(40),
    capacity INTEGER NOT NULL,
    room_type VARCHAR(20) NOT NULL,
    conditioning VARCHAR(20) NOT NULL,
    base_rent_paise BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_rooms_property
        FOREIGN KEY (property_id)
        REFERENCES property.properties (id)
);

CREATE INDEX idx_properties_owner_id
    ON property.properties (owner_id);

CREATE INDEX idx_properties_owner_active
    ON property.properties (owner_id, is_active);

CREATE INDEX idx_rooms_property_id
    ON property.rooms (property_id);

CREATE INDEX idx_rooms_property_status
    ON property.rooms (property_id, status);

CREATE UNIQUE INDEX uq_active_room_number_per_property
    ON property.rooms (property_id, room_number)
    WHERE is_active = TRUE;
