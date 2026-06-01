ALTER TABLE discovery.property_local_places
    DROP COLUMN IF EXISTS category,
    DROP COLUMN IF EXISTS custom_category;
