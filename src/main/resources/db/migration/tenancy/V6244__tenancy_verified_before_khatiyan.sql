-- The owner declared this tenant's identity was verified before Khatiyan
-- (user, 2026-10-28). Only a stay carried over from before Khatiyan can say so.

ALTER TABLE tenancy.tenancies
    ADD COLUMN verified_before_khatiyan boolean NOT NULL DEFAULT false;

ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_verified_before_khatiyan
        CHECK (NOT verified_before_khatiyan OR transitioned);
