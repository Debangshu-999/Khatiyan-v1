-- The clause model is replaced wholesale, so the old rows go.
--
-- Old agreements carry systemType values that no longer exist as enum constants
-- (LOCK_IN, CLEANING_FEE, DAMAGE_CATALOG, ALLOWED_DEDUCTIONS...). Keeping them
-- would mean every read either 500s on deserialisation or needs a legacy branch
-- in the renderer forever.
--
-- This is only safe because nothing here has been signed for real. The standing
-- rule still holds for everything AFTER this migration: an accepted agreement is
-- frozen and content-hashed, so no enum constant persisted from here on may ever
-- be removed.

DELETE FROM compliance.tenancy_agreements;
DELETE FROM compliance.property_agreement_settings;

-- Settings no longer store rendered clauses. They stored prose resolved against
-- no particular tenancy — a rent sentence with nobody's rent in it, waiting to be
-- copied. A template holds only what the owner decided; the words are produced
-- per tenancy from that tenancy's facts.
ALTER TABLE compliance.property_agreement_settings
    DROP COLUMN default_clauses;

ALTER TABLE compliance.property_agreement_settings
    ADD COLUMN template JSONB NOT NULL
        DEFAULT '{"excludedMainClauses":[],"miscClauses":[],"customClauses":[],"defaultValidityMonths":null,"defaultEarlyExitRule":""}'::jsonb;

-- The agreement keeps its rendered clauses AND how they were built. The template
-- beside them is what makes a PENDING deed re-editable: changing it re-runs the
-- assembler. After acceptance the frozen clause list is the agreement and the
-- template is only a record of its construction.
ALTER TABLE compliance.tenancy_agreements
    ADD COLUMN template JSONB NOT NULL
        DEFAULT '{"excludedMainClauses":[],"miscClauses":[],"customClauses":[],"defaultValidityMonths":null,"defaultEarlyExitRule":""}'::jsonb;
