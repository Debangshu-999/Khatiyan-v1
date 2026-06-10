-- Adds the structured context fields used by the in-app notification UI to
-- render richer cards and, later, route taps to the relevant screen.
--
--   subtype  Specific event flavour within a category, e.g. CONCERN_RAISED
--            vs CONCERN_RESOLVED. Nullable so historical rows and reminder-
--            driven notifications (which don't pre-resolve a subtype yet)
--            remain valid.
--   data     JSON map of String->String references. Always populated for
--            new rows (empty object {} when nothing meaningful to carry)
--            so consumers can read .data.propertyId etc. without null-
--            checking the whole field.
ALTER TABLE notification.notifications
    ADD COLUMN subtype VARCHAR(60) NULL,
    ADD COLUMN data JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX idx_notifications_subtype
    ON notification.notifications (subtype);
