-- Every room type has at least one photo from now on (user, 2026-10-29). A
-- type that has none is given its property's first listing photo, as a link
-- only: no public_id, so removing it from the type never deletes the
-- listing's own file. A property with no listing photo borrows the first
-- listing photo there is.

INSERT INTO property.room_mold_images (mold_id, position, url, public_id)
SELECT m.id, 0,
       COALESCE(
           (SELECT pi.url FROM discovery.property_images pi
             WHERE pi.property_id = m.property_id ORDER BY pi.sort_order LIMIT 1),
           (SELECT pi.url FROM discovery.property_images pi ORDER BY pi.created_at, pi.sort_order LIMIT 1)),
       NULL
FROM property.room_molds m
WHERE NOT EXISTS (SELECT 1 FROM property.room_mold_images i WHERE i.mold_id = m.id)
  AND EXISTS (SELECT 1 FROM discovery.property_images);
