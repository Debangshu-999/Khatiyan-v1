-- Who has to perform the check.
--
-- Held on the grant rather than looked up through the tenancy on every call.
-- The tenant hits these endpoints from their own phone, so every request has to
-- answer "is this grant yours" before anything else happens, and a join across
-- two modules to decide an authorisation question is a join that will one day
-- be skipped by a caller in a hurry.
ALTER TABLE verification.verification_grants
    ADD COLUMN tenant_user_id UUID;

-- Nullable only because the table already exists. Nothing writes a grant
-- without one, and every read path treats a null as "not yours".
CREATE INDEX verification_grants_tenant_idx
    ON verification.verification_grants (tenant_user_id);
