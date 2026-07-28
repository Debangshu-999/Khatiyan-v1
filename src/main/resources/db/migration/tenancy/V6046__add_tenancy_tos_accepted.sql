-- Tenancy agreement acceptance gate. A monthly tenancy created with an agreement
-- is inserted as PENDING_ACCEPTANCE with tos_accepted = false and stays that way
-- until the tenant accepts (or it is declined / expires). Existing tenancies are
-- grandfathered as already accepted so no current tenant is ever gated.
ALTER TABLE tenancy.tenancies
    ADD COLUMN tos_accepted BOOLEAN NOT NULL DEFAULT TRUE;
