-- A property's discovery gallery: up to ten images, ordered, with the first
-- acting as the listing cover.
--
-- Until now a property had exactly one image, held on the profile row as
-- profile_image_url. That column stays as the cover so every existing read path
-- (cards, detail, the management profile) keeps working untouched; this table is
-- the full gallery and the row at sort_order 0 is kept in step with it.
--
-- sort_order rather than "position": POSITION is a SQL keyword, and quoting a
-- column name forever to dodge it is a poor trade.

CREATE TABLE discovery.property_images (
    id UUID NOT NULL,
    property_id UUID NOT NULL,
    url VARCHAR(600) NOT NULL,
    -- Cloudinary handle. Nullable because the backfilled rows below predate the
    -- upload pipeline and only ever had a URL. Without it the asset cannot be
    -- deleted — see the note on V6070.
    public_id VARCHAR(255),
    sort_order INTEGER NOT NULL,
    -- Both audit columns come from BaseEntity and are NOT NULL there. With
    -- ddl-auto: validate, omitting either fails startup rather than a query.
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_property_images PRIMARY KEY (id)
);

-- One image per slot per property. Reordering rewrites the whole block for a
-- property inside a single transaction, so this never sees a partial shuffle.
CREATE UNIQUE INDEX uq_property_images_property_sort
    ON discovery.property_images (property_id, sort_order);

CREATE INDEX idx_property_images_property
    ON discovery.property_images (property_id);

-- Carry the existing single image over as the cover so no property loses its
-- picture. gen_random_uuid() is pgcrypto, available on the versions this app
-- already requires.
INSERT INTO discovery.property_images (id, property_id, url, public_id, sort_order, created_at, updated_at)
SELECT gen_random_uuid(), property_id, profile_image_url, profile_image_public_id, 0, now(), now()
FROM discovery.property_discovery_profiles
WHERE profile_image_url IS NOT NULL
  AND profile_image_url <> '';
