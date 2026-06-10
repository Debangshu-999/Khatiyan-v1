ALTER TABLE property.properties
    ADD COLUMN state VARCHAR(80);

CREATE INDEX IF NOT EXISTS idx_properties_state_city_active
    ON property.properties (state, city, is_active);
