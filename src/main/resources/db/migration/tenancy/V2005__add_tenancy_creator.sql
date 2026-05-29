ALTER TABLE tenancy.tenancies
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_tenancies_created_by_user
    ON tenancy.tenancies (created_by_user_id);
