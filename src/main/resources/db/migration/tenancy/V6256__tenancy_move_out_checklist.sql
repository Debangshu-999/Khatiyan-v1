-- Each tenancy has its own move-out checklist, set at onboarding (user,
-- 2026-10-29). Null on a stay from before, which reads the property's list.
ALTER TABLE tenancy.tenancies
    ADD COLUMN move_out_checklist jsonb;
