-- New properties start with damage levels OFF (user, 2026-11-07): a damage is
-- recorded with an amount, no level, until the owner turns levels on. Existing
-- properties keep whatever they have.
ALTER TABLE property.properties
    ALTER COLUMN damage_levels_enabled SET DEFAULT FALSE;
