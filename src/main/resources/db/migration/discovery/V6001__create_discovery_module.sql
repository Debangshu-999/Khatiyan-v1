CREATE SCHEMA IF NOT EXISTS discovery;

CREATE TABLE discovery.property_discovery_profiles (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    headline VARCHAR(160),
    description VARCHAR(1000),
    profile_image_url VARCHAR(600),
    public_visible BOOLEAN NOT NULL DEFAULT FALSE,
    show_owner_contact BOOLEAN NOT NULL DEFAULT TRUE,
    show_manager_contact BOOLEAN NOT NULL DEFAULT TRUE,
    published_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_discovery_profiles_property
        FOREIGN KEY (property_id)
        REFERENCES property.properties (id)
);

CREATE UNIQUE INDEX uq_discovery_profile_property
    ON discovery.property_discovery_profiles (property_id);

CREATE INDEX idx_discovery_profiles_visible
    ON discovery.property_discovery_profiles (public_visible, is_active, published_at);

CREATE TABLE discovery.property_local_places (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    category VARCHAR(40) NOT NULL,
    custom_category VARCHAR(80),
    description VARCHAR(800),
    phone VARCHAR(20),
    address_text VARCHAR(300),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    directions_url VARCHAR(600),
    photo_url VARCHAR(600),
    owner_recommended BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_property_local_places_property
        FOREIGN KEY (property_id)
        REFERENCES property.properties (id)
);

CREATE INDEX idx_property_local_places_property_active
    ON discovery.property_local_places (property_id, is_active);

CREATE INDEX idx_property_local_places_category
    ON discovery.property_local_places (property_id, category, is_active);
