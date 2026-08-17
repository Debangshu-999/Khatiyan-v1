-- Cloudinary handles for the discovery module's two image columns. See the
-- note on V6070 — a URL cannot be used to delete the underlying asset.

ALTER TABLE discovery.property_discovery_profiles
    ADD COLUMN profile_image_public_id VARCHAR(255);

ALTER TABLE discovery.property_local_places
    ADD COLUMN photo_public_id VARCHAR(255);
