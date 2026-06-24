ALTER TABLE property.properties
    ADD COLUMN area VARCHAR(120) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_properties_state_city_area_active
    ON property.properties (state, city, area, is_active);
