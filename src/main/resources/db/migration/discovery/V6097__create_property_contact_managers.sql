-- Which managers a listing offers as a way to reach the property.
--
-- The profile already carries `show_manager_contact`, a single boolean, which
-- can only say "managers, yes or no" — it cannot say WHICH. A property with four
-- managers has no way to publish the one who actually takes calls, so the flag
-- was never usable and nothing on the client read it.
--
-- The owner is deliberately not a row here. Every listing has exactly one owner,
-- they are always reachable, and storing that would invite a state where a
-- property has no contact at all.

CREATE TABLE discovery.property_contact_managers (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    manager_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

-- One row per manager per property: adding the same manager twice is a no-op,
-- not a duplicate entry in the public profile.
CREATE UNIQUE INDEX uq_property_contact_managers_property_manager
    ON discovery.property_contact_managers (property_id, manager_user_id);

CREATE INDEX idx_property_contact_managers_property
    ON discovery.property_contact_managers (property_id);
