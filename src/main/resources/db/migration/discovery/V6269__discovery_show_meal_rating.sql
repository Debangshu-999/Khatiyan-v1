-- Whether a listing shows its current meal rating on the public profile (user, 2026-11-03).
-- Off until the owner turns it on, as this publishes a figure they have only seen themselves.
ALTER TABLE discovery.property_discovery_profiles
    ADD COLUMN show_meal_rating BOOLEAN NOT NULL DEFAULT FALSE;
