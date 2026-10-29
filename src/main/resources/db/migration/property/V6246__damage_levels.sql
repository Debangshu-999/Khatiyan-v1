-- Damage levels (P1.9.a, user, 2026-10-29): NA, D1, D2, D3, D3 the worst.
-- The same levels for every item, each priced per item. NA costs nothing.
-- An item's old flat charge becomes its price at every level, for the owner to
-- set apart. charge_paise stays, kept equal to D3 by the app, for the deed and
-- the end-tenancy screen until move-out uses the levels.

ALTER TABLE property.property_damage_charges
    ADD COLUMN d1_paise bigint,
    ADD COLUMN d2_paise bigint,
    ADD COLUMN d3_paise bigint;

UPDATE property.property_damage_charges
SET d1_paise = charge_paise, d2_paise = charge_paise, d3_paise = charge_paise;

ALTER TABLE property.property_damage_charges
    ALTER COLUMN d1_paise SET NOT NULL,
    ALTER COLUMN d2_paise SET NOT NULL,
    ALTER COLUMN d3_paise SET NOT NULL,
    ADD CONSTRAINT chk_damage_charge_levels
        CHECK (d1_paise >= 0 AND d1_paise <= d2_paise AND d2_paise <= d3_paise);

-- What each level means at this property, the same for every item.
ALTER TABLE property.properties
    ADD COLUMN damage_level_d1 varchar(120) NOT NULL DEFAULT 'Light wear. Cleaning or a small fix',
    ADD COLUMN damage_level_d2 varchar(120) NOT NULL DEFAULT 'Damaged. Needs repair',
    ADD COLUMN damage_level_d3 varchar(120) NOT NULL DEFAULT 'Broken or missing. Must be replaced';
