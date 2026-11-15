-- A damage recorded while its property's damage levels are off has no level
-- (user, 2026-11-07). Records made with levels keep theirs.
ALTER TABLE billing.damage_records
    ALTER COLUMN damage_level DROP NOT NULL;
