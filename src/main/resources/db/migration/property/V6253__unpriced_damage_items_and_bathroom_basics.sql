-- The damage list is what the move-in checklist's room and bathroom are made
-- of (user, 2026-10-29), so an item can be on it before it is priced: d1_paise
-- null, nothing charged. Properties with attached bathrooms get the bathroom's
-- basics on it, unpriced, for the owner to price or delete.

ALTER TABLE property.property_damage_charges
    DROP CONSTRAINT chk_damage_charge_levels,
    ALTER COLUMN d1_paise DROP NOT NULL,
    ADD CONSTRAINT chk_damage_charge_levels CHECK (
        (d1_paise IS NULL AND d2_paise IS NULL AND d3_paise IS NULL AND charge_paise = 0)
        OR (d1_paise >= 0
            AND (d2_paise IS NULL OR d2_paise >= d1_paise)
            AND (d3_paise IS NULL OR (d2_paise IS NOT NULL AND d3_paise >= d2_paise))));

INSERT INTO property.property_damage_charges (property_id, display_order, name, charge_paise, d1_paise, d2_paise, d3_paise, category)
SELECT p.id,
       COALESCE((SELECT max(c.display_order) FROM property.property_damage_charges c WHERE c.property_id = p.id), -1)
           + row_number() OVER (PARTITION BY p.id ORDER BY b.ord),
       b.name, 0, NULL, NULL, NULL, 'BATHROOM'
FROM property.properties p
CROSS JOIN (VALUES (1, 'Taps'), (2, 'Shower'), (3, 'Wash basin'), (4, 'Mirror'), (5, 'Bucket'), (6, 'Mug')) AS b(ord, name)
WHERE p.bathroom_type = 'ATTACHED'
  AND NOT EXISTS (
      SELECT 1 FROM property.property_damage_charges c
      WHERE c.property_id = p.id AND lower(c.name) = lower(b.name));
