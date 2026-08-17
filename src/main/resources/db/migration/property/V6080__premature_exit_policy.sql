-- The property's premature exit policy: what happens when a tenant on an
-- indefinite agreement leaves before serving their notice.
--
-- Free text, written by the owner, applied by a person at end-tenancy. We
-- deliberately do not model it: the computed early-exit penalty this replaces
-- was a formula nobody agreed to, and every property prices an early departure
-- differently. A paragraph the owner wrote is both more honest and more
-- flexible than a proration constant.
--
-- Additive and inert on its own. Nothing reads it until the end-tenancy step is
-- built; existing properties simply have none.

ALTER TABLE property.properties
    ADD COLUMN IF NOT EXISTS premature_exit_policy VARCHAR(2000);
