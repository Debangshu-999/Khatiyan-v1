ALTER TABLE auth.users
ADD COLUMN IF NOT EXISTS is_active_tenant BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE auth.users
SET is_active_tenant = TRUE,
    role = 'USER'
WHERE role = 'TENANT';
