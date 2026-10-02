-- The leads pipeline: one record per person per property, from their enquiry
-- to the day they move in.
--
-- Design: docs/superpowers/specs/2026-09-30-leads-engine-design.md.
--
-- The record is called a lead in code even while it is only at ENQUIRED, which
-- the owner does not yet count as a lead. It is opened by an enquiry (and,
-- later, by a visit booked straight from the property profile).
--
-- This module never owns the handler or the attempts. Those belong to the
-- enquiry module. A lead's handler and responded_at are copied from the
-- enquiry each time the enquiry changes, so the pipeline can be listed and
-- counted without reading another module's tables.

CREATE SCHEMA IF NOT EXISTS lead;

CREATE TABLE lead.leads (
    id UUID NOT NULL,
    reference_code VARCHAR(40) NOT NULL,
    property_id UUID NOT NULL,
    -- auth.users.id. Always a signed-in person: leads come only from Khatiyan
    -- enquiries. No FK: cross-module.
    prospect_user_id UUID NOT NULL,
    -- The enquiry that opened it. Null once a visit booked with no enquiry can
    -- open one. No FK: cross-module.
    enquiry_id UUID,
    stage VARCHAR(20) NOT NULL,
    state VARCHAR(10) NOT NULL,
    close_reason VARCHAR(40),
    closed_at TIMESTAMPTZ,
    handler_user_id UUID,
    handler_assigned_by VARCHAR(20),
    handler_assigned_at TIMESTAMPTZ,
    -- The moment it reached each stage. Monthly numbers count each one in the
    -- month it happened.
    enquired_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    early_lead_at TIMESTAMPTZ,
    advanced_lead_at TIMESTAMPTZ,
    booked_at TIMESTAMPTZ,
    moved_in_at TIMESTAMPTZ,
    -- tenancy.tenancies.id once they move in. No FK: cross-module.
    converted_tenancy_id UUID,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_leads PRIMARY KEY (id),
    CONSTRAINT uq_leads_reference_code UNIQUE (reference_code),
    CONSTRAINT chk_leads_stage
        CHECK (stage IN ('ENQUIRED', 'EARLY_LEAD', 'ADVANCED_LEAD', 'BOOKED', 'MOVED_IN')),
    CONSTRAINT chk_leads_state
        CHECK (state IN ('OPEN', 'CLOSED')),
    -- Closed means it has a reason and a time. Open means it has neither.
    CONSTRAINT chk_leads_closed_complete
        CHECK ((state = 'CLOSED' AND close_reason IS NOT NULL AND closed_at IS NOT NULL)
            OR (state = 'OPEN' AND close_reason IS NULL AND closed_at IS NULL)),
    CONSTRAINT chk_leads_handler_assigned_by
        CHECK (handler_assigned_by IS NULL
            OR handler_assigned_by IN ('FIRST_RESPONSE', 'SYSTEM', 'OWNER')),
    CONSTRAINT chk_leads_handler_complete
        CHECK ((handler_user_id IS NULL AND handler_assigned_by IS NULL AND handler_assigned_at IS NULL)
            OR (handler_user_id IS NOT NULL AND handler_assigned_by IS NOT NULL AND handler_assigned_at IS NOT NULL))
);

-- One open record per person per property. A second enquiry from the same
-- person joins the open record instead of starting another.
CREATE UNIQUE INDEX uq_leads_open_per_prospect_property
    ON lead.leads (property_id, prospect_user_id)
    WHERE state = 'OPEN';

-- The property's list, filtered by state and stage, newest first.
CREATE INDEX idx_leads_property_state_stage_created
    ON lead.leads (property_id, state, stage, created_at DESC);

-- Which lead an enquiry belongs to. A lead can gather several enquiries from
-- the same person. An enquiry belongs to exactly one lead.
CREATE TABLE lead.lead_enquiries (
    enquiry_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_lead_enquiries PRIMARY KEY (enquiry_id),
    CONSTRAINT fk_lead_enquiries_lead
        FOREIGN KEY (lead_id)
        REFERENCES lead.leads (id)
        ON DELETE CASCADE
);

CREATE INDEX idx_lead_enquiries_lead
    ON lead.lead_enquiries (lead_id);

-- The timeline: what happened to a lead, in order.
CREATE TABLE lead.lead_activities (
    id UUID NOT NULL,
    lead_id UUID NOT NULL,
    type VARCHAR(40) NOT NULL,
    -- Who did it. Null when the system did.
    actor_user_id UUID,
    -- Who it was about, when that is a person: the handler it was given to.
    subject_user_id UUID,
    enquiry_id UUID,
    detail VARCHAR(500),
    occurred_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_lead_activities PRIMARY KEY (id),
    CONSTRAINT fk_lead_activities_lead
        FOREIGN KEY (lead_id)
        REFERENCES lead.leads (id)
        ON DELETE CASCADE
);

CREATE INDEX idx_lead_activities_lead_occurred
    ON lead.lead_activities (lead_id, occurred_at DESC);
