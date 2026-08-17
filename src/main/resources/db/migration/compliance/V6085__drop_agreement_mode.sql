-- Agreement mode goes: an agreement is compulsory on every tenancy now.
--
-- OFF / SELECTIVE / ALL_MONTHLY asked whether agreements applied at all. Under
-- the current model they always do — the agreement is the two-way handshake that
-- makes a tenancy record evidence of anything — so all three values collapse to
-- one and the setting stops meaning anything.
--
-- It already drove nothing: no code branched on the value. This removes the
-- storage so nobody reintroduces a branch on a setting that cannot vary.

ALTER TABLE compliance.property_agreement_settings
    DROP COLUMN IF EXISTS mode;
