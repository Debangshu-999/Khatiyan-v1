-- Owner-granted, per-resource manager permissions.
--
-- Until now a manager was all-or-nothing: assigned to a property meant the same
-- power as the owner. This lets an owner say "watch the bills but do not touch
-- them" or "never see the exit policy".
--
-- Keyed on (property, manager user) rather than on the property_managers row so
-- the policy check matches how access is already tested
-- (existsByPropertyIdAndManagerUserIdAndActiveTrue). Rows are removed when a
-- manager is removed, so re-adding someone starts them from nothing again.
CREATE TABLE property.manager_permissions (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    manager_user_id UUID NOT NULL,
    -- ManagerResource. Stored as text, not an enum type: adding a resource is a
    -- product decision and must not need a schema change.
    resource VARCHAR(40) NOT NULL,
    -- ManagerAccessLevel. NONE rows are never stored — absence IS none, so a
    -- manager with no rows has no access, which is the required default for
    -- every existing manager.
    access_level VARCHAR(10) NOT NULL,
    granted_by_user_id UUID NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_manager_permissions_level
        CHECK (access_level IN ('VIEW', 'MANAGE'))
);

CREATE UNIQUE INDEX uq_manager_permissions_resource
    ON property.manager_permissions (property_id, manager_user_id, resource);

-- The policy check loads every grant for one manager on one property at once.
CREATE INDEX idx_manager_permissions_lookup
    ON property.manager_permissions (property_id, manager_user_id);
