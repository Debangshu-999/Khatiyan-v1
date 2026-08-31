-- Photos of a room type.
--
-- Ordered, because the first one is the one a listing shows: an @OrderColumn on
-- the owning side keeps "which is the cover" a property of the list rather than
-- a nullable is_cover flag that two rows could both claim.
--
-- ON DELETE CASCADE, unlike rooms.mold_id: a photo of a mold has no meaning
-- without it, whereas a room does.
CREATE TABLE property.room_mold_images (
    mold_id    UUID         NOT NULL REFERENCES property.room_molds (id) ON DELETE CASCADE,
    position   INT          NOT NULL,
    url        VARCHAR(600) NOT NULL,
    public_id  VARCHAR(255),
    PRIMARY KEY (mold_id, position)
);

CREATE INDEX ix_room_mold_images_mold ON property.room_mold_images (mold_id);
