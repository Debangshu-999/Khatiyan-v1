-- Properties a person saved from a listing (user, 2026-11-14): the bookmark on
-- the property profile, listed on the Saved properties screen, newest first.
-- One row per person per property, so saving twice is a no-op.

CREATE TABLE IF NOT EXISTS discovery.saved_properties (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    property_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_properties_user_property
    ON discovery.saved_properties (user_id, property_id);

CREATE INDEX IF NOT EXISTS idx_saved_properties_user_created
    ON discovery.saved_properties (user_id, created_at DESC);
