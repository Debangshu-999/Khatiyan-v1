-- Geo search support without extensions.
--
-- Geo-ranked discovery uses a bounding-box prefilter (these btree indexes) plus
-- an exact haversine distance computed in SQL — deliberately NOT PostGIS or
-- earthdistance: both need binaries/superuser on every environment, while this
-- works on any vanilla PostgreSQL and is index-driven far beyond this app's
-- scale. If polygon queries are ever needed, PostGIS slots in as a drop-in
-- replacement for the same repository method.
--
-- Partial indexes: rows without coordinates can never match a box query.
CREATE INDEX IF NOT EXISTS idx_properties_lat_lng
    ON property.properties (latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_local_places_lat_lng
    ON discovery.property_local_places (latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
