ALTER TABLE property.properties
    ADD COLUMN pg_for VARCHAR(20) NOT NULL DEFAULT 'ANYONE',
    ADD COLUMN preferred_for VARCHAR(20) NOT NULL DEFAULT 'ANYONE',
    ADD COLUMN food_included BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN electricity_included BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN bathroom_type VARCHAR(20) NOT NULL DEFAULT 'COMMON';

CREATE TABLE property.property_included_meals (
    property_id UUID NOT NULL REFERENCES property.properties(id) ON DELETE CASCADE,
    meal_type VARCHAR(20) NOT NULL,
    PRIMARY KEY (property_id, meal_type)
);

CREATE TABLE property.property_available_sharing_types (
    property_id UUID NOT NULL REFERENCES property.properties(id) ON DELETE CASCADE,
    sharing_type VARCHAR(30) NOT NULL,
    PRIMARY KEY (property_id, sharing_type)
);

CREATE INDEX idx_properties_discovery_filter_values
    ON property.properties (pg_for, preferred_for, food_included, electricity_included, bathroom_type)
    WHERE is_active = TRUE;

CREATE INDEX idx_property_included_meals_lookup
    ON property.property_included_meals (meal_type, property_id);

CREATE INDEX idx_property_available_sharing_types_lookup
    ON property.property_available_sharing_types (sharing_type, property_id);
