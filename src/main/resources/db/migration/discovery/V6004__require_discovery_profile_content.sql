UPDATE discovery.property_discovery_profiles profile
SET headline = COALESCE(NULLIF(TRIM(profile.headline), ''), property.name || ' in ' || property.city),
    description = COALESCE(
        NULLIF(TRIM(profile.description), ''),
        'Located at ' || property.address || ', ' || property.city || ' ' || property.pincode || '.'
    )
FROM property.properties property
WHERE property.id = profile.property_id
  AND (
      profile.headline IS NULL
      OR TRIM(profile.headline) = ''
      OR profile.description IS NULL
      OR TRIM(profile.description) = ''
  );

ALTER TABLE discovery.property_discovery_profiles
    ALTER COLUMN headline SET NOT NULL;

ALTER TABLE discovery.property_discovery_profiles
    ALTER COLUMN description SET NOT NULL;
