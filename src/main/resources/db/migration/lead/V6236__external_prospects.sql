-- People who reached a property outside the app (2026-10-19): someone who
-- walked in and saw the place, or booked in person or by phone. Just a
-- record, not an account: no sign-in and nothing sent to them. The account is
-- made at move-in, by onboarding.
--
-- Spec: docs/superpowers/specs/2026-10-19-external-visits-and-bookings-design.md
-- Immutable from first write: a correction is a later Flyway version.

CREATE TABLE lead.external_prospects (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    -- As normalised by the app (+91...). The same phone at the same property is the same person.
    phone VARCHAR(20) NOT NULL,
    created_by_user_id UUID,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_external_prospects_property_phone UNIQUE (property_id, phone)
);

-- A lead is an app user's or an external person's, never both, never neither.
ALTER TABLE lead.leads
    ALTER COLUMN prospect_user_id DROP NOT NULL,
    ADD COLUMN external_prospect_id UUID REFERENCES lead.external_prospects (id),
    ADD CONSTRAINT chk_leads_one_prospect CHECK ((prospect_user_id IS NULL) <> (external_prospect_id IS NULL));
CREATE UNIQUE INDEX uq_leads_open_per_external_prospect
    ON lead.leads (property_id, external_prospect_id) WHERE state = 'OPEN' AND external_prospect_id IS NOT NULL;

-- So is a visit. An external visit also keeps what the property noted about it:
-- whether they were interested, the sharing they wanted, their budget, a note.
ALTER TABLE lead.visits
    ALTER COLUMN prospect_user_id DROP NOT NULL,
    ADD COLUMN external_prospect_id UUID REFERENCES lead.external_prospects (id),
    ADD COLUMN interest VARCHAR(10),
    ADD COLUMN wanted_sharing VARCHAR(20),
    ADD COLUMN budget_paise BIGINT,
    ADD COLUMN note VARCHAR(500),
    ADD CONSTRAINT chk_visits_one_prospect CHECK ((prospect_user_id IS NULL) <> (external_prospect_id IS NULL)),
    ADD CONSTRAINT chk_visits_interest CHECK (interest IS NULL OR interest IN ('YES', 'NOT_SURE', 'NO')),
    ADD CONSTRAINT chk_visits_budget CHECK (budget_paise IS NULL OR budget_paise > 0);
