-- What a listing photo is a photo OF.
--
-- A gallery of ten untitled rooms tells a prospect very little: they can see a
-- bed, but not whether it is the room on offer, the common area, or a photo of
-- the building from the road. The owner knows; nothing asked them.
--
-- Nullable, and stays nullable: every image uploaded before this had no chance
-- to carry one, and a caption is a courtesy rather than a requirement — a
-- listing with an unlabelled photo is worse than one with no photo, but far
-- better than one the owner abandoned at an upload form.

ALTER TABLE discovery.property_images
    ADD COLUMN caption VARCHAR(60);
