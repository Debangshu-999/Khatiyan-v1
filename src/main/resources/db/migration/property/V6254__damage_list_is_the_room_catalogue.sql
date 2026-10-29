-- The damage list is the one list of what a room can have (user, 2026-10-29).
-- Amenities stop being a category of their own: they are Room or Bathroom
-- items, and room types pick their things from the list. A common toilet's
-- things are listed under COMMON_TOILET, never priced.

ALTER TABLE property.property_damage_charges
    ALTER COLUMN category TYPE varchar(20),
    DROP CONSTRAINT chk_damage_charge_category,
    ADD CONSTRAINT chk_damage_charge_category CHECK (category IN ('ROOM', 'AMENITY', 'BATHROOM', 'COMMON_TOILET')),
    ADD CONSTRAINT chk_common_toilet_unpriced CHECK (category <> 'COMMON_TOILET' OR d1_paise IS NULL);

-- Amenities become Room items; a geyser is the bathroom's, or the common toilet's.
UPDATE property.property_damage_charges c
SET category = CASE
        WHEN lower(c.name) = 'geyser' AND p.bathroom_type = 'ATTACHED' THEN 'BATHROOM'
        WHEN lower(c.name) = 'geyser' THEN 'COMMON_TOILET'
        ELSE 'ROOM' END,
    d1_paise = CASE WHEN lower(c.name) = 'geyser' AND p.bathroom_type <> 'ATTACHED' THEN NULL ELSE c.d1_paise END,
    d2_paise = CASE WHEN lower(c.name) = 'geyser' AND p.bathroom_type <> 'ATTACHED' THEN NULL ELSE c.d2_paise END,
    d3_paise = CASE WHEN lower(c.name) = 'geyser' AND p.bathroom_type <> 'ATTACHED' THEN NULL ELSE c.d3_paise END,
    charge_paise = CASE WHEN lower(c.name) = 'geyser' AND p.bathroom_type <> 'ATTACHED' THEN 0 ELSE c.charge_paise END
FROM property.properties p
WHERE p.id = c.property_id AND c.category = 'AMENITY';

-- Everything rooms and room types already have joins the list, unpriced, so
-- no room loses a thing it has. Common bathrooms get the toilet's basic list.
WITH things AS (
    SELECT r.property_id, a.amenity AS code, NULL::varchar AS custom FROM property.room_amenities a JOIN property.rooms r ON r.id = a.room_id
    UNION ALL
    SELECT m.property_id, a.amenity, NULL FROM property.room_mold_amenities a JOIN property.room_molds m ON m.id = a.mold_id
    UNION ALL
    SELECT r.property_id, NULL, c.name FROM property.room_custom_amenities c JOIN property.rooms r ON r.id = c.room_id
    UNION ALL
    SELECT m.property_id, NULL, c.name FROM property.room_mold_custom_amenities c JOIN property.room_molds m ON m.id = c.mold_id
),
named AS (
    SELECT t.property_id,
           COALESCE(t.custom, CASE t.code WHEN 'CUPBOARD' THEN 'Cupboard' WHEN 'TV' THEN 'TV'
                                          WHEN 'BEDDING' THEN 'Bedding' WHEN 'GEYSER' THEN 'Geyser' END) AS name,
           CASE WHEN t.code = 'GEYSER' AND p.bathroom_type = 'ATTACHED' THEN 'BATHROOM'
                WHEN t.code = 'GEYSER' THEN 'COMMON_TOILET'
                ELSE 'ROOM' END AS category
    FROM things t JOIN property.properties p ON p.id = t.property_id
    WHERE t.custom IS NOT NULL OR t.code IN ('CUPBOARD', 'TV', 'BEDDING', 'GEYSER')
    UNION ALL
    SELECT p.id, b.name, 'COMMON_TOILET'
    FROM property.properties p
    CROSS JOIN (VALUES ('Taps'), ('Shower'), ('Wash basin'), ('Mirror'), ('Bucket'), ('Mug')) AS b(name)
    WHERE p.bathroom_type = 'COMMON'
),
wanted AS (
    SELECT DISTINCT ON (n.property_id, lower(n.name)) n.property_id, n.name, n.category
    FROM named n
    WHERE NOT EXISTS (
        SELECT 1 FROM property.property_damage_charges c
        WHERE c.property_id = n.property_id AND lower(c.name) = lower(n.name))
    ORDER BY n.property_id, lower(n.name), n.category
)
INSERT INTO property.property_damage_charges (property_id, display_order, name, charge_paise, d1_paise, d2_paise, d3_paise, category)
SELECT w.property_id,
       COALESCE((SELECT max(c.display_order) FROM property.property_damage_charges c WHERE c.property_id = w.property_id), -1)
           + row_number() OVER (PARTITION BY w.property_id ORDER BY w.category, w.name),
       left(w.name, 80), 0, NULL, NULL, NULL, w.category
FROM wanted w;
