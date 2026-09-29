-- Stays cancelled before VerificationTenancyListener existed left their checks
-- open, and those showed up beside the next stay's check on the tenant's
-- screen. Close them the way the listener now does: anything not VERIFIED.
UPDATE verification.verification_grants g
SET status = 'CANCELLED',
    updated_at = now()
FROM tenancy.tenancies t
WHERE t.id = g.tenancy_id
  AND t.status = 'CANCELLED'
  AND g.status IN ('PENDING', 'EXHAUSTED');
