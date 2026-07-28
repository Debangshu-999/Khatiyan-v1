-- Allow owner-custom top-level categories (like custom subcategories). Curated
-- categories stay global (property_id NULL, is_custom false); custom ones are
-- scoped to a property. Widen slug to hold generated "custom-<uuid>" slugs.

ALTER TABLE discovery.local_place_categories ALTER COLUMN slug TYPE VARCHAR(60);
ALTER TABLE discovery.local_place_categories ADD COLUMN is_custom BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE discovery.local_place_categories ADD COLUMN property_id UUID;

-- One custom category name per property (curated ones remain globally unique on slug).
CREATE UNIQUE INDEX ux_category_custom_name
    ON discovery.local_place_categories(property_id, lower(name)) WHERE property_id IS NOT NULL;
CREATE INDEX idx_category_property ON discovery.local_place_categories(property_id);
