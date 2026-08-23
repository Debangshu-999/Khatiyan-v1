-- Reordering a gallery renumbers every row, and the intermediate states are not
-- unique.
--
-- V6072 created a plain UNIQUE INDEX on (property_id, sort_order) and reasoned
-- that "reordering rewrites the whole block inside a single transaction, so this
-- never sees a partial shuffle". That is not how Postgres checks a unique index:
-- it is enforced per statement, not at commit. Promoting the third image to
-- cover writes sort_order 0 on it while the current cover still holds 0, and the
-- statement fails before the rest of the block is written.
--
-- A deferrable constraint moves the check to commit, where the block IS whole.
-- Only a constraint can be deferred — a bare index cannot — so the index is
-- replaced rather than altered.

DROP INDEX IF EXISTS discovery.uq_property_images_property_sort;

ALTER TABLE discovery.property_images
    ADD CONSTRAINT uq_property_images_property_sort
    UNIQUE (property_id, sort_order)
    DEFERRABLE INITIALLY DEFERRED;
