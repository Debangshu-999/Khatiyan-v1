ALTER TABLE property.properties
    ADD COLUMN discovery_profile_created BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE property.properties property
SET discovery_profile_created = TRUE
WHERE EXISTS (
    SELECT 1
    FROM discovery.property_discovery_profiles profile
    WHERE profile.property_id = property.id
      AND profile.is_active = TRUE
);
