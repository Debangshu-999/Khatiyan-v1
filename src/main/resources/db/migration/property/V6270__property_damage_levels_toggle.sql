-- Whether this property grades damage by level (NA, D1, D2, D3), user 2026-11-07.
-- On by default, as every property graded by level until now. Off, a damage is
-- recorded with a manual amount and no level.
ALTER TABLE property.properties
    ADD COLUMN damage_levels_enabled BOOLEAN NOT NULL DEFAULT TRUE;
