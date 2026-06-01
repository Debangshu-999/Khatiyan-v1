CREATE INDEX IF NOT EXISTS idx_properties_city_active
    ON property.properties (LOWER(city), is_active);
