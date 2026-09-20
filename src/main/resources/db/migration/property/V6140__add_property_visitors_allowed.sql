-- Whether tenants may have visitors.
--
-- Nullable on purpose: every existing property was registered before the
-- question was asked, and a default of either answer would put words in the
-- owner's mouth. Null is shown on the listing as "Not specified".
ALTER TABLE property.properties
    ADD COLUMN visitors_allowed BOOLEAN;
