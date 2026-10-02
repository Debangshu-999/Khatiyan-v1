-- Visits to a property, booked by the prospect or by the enquiry's handler.
--
-- Owner's design, 2026-10-03: stored here now, shown on a scheduled-visits
-- screen later. A visit scheduled by either side makes the lead an early lead.
--
-- A slot is a date plus the start of one of the property's visit slots for that
-- weekday (property.property_visit_slots). The times are copied onto the visit:
-- the owner can change the property's slots afterwards, and a visit already
-- agreed must not move because of it.
--
-- Times of day are minutes from midnight, not TIME columns: a TIME written
-- through the JDBC driver lands 5:30 early here.

CREATE TABLE lead.visits (
    id UUID NOT NULL,
    reference_code VARCHAR(40) NOT NULL,
    lead_id UUID NOT NULL,
    property_id UUID NOT NULL,
    prospect_user_id UUID NOT NULL,
    -- The enquiry it was booked from. Null once a visit can be booked straight
    -- from the property profile.
    enquiry_id UUID,
    visit_date DATE NOT NULL,
    slot_start_minute INTEGER NOT NULL,
    slot_end_minute INTEGER NOT NULL,
    booked_by VARCHAR(10) NOT NULL,
    booked_by_user_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL,
    -- How many times the prospect has moved it. Two at most. After that the
    -- property moves it.
    tenant_reschedules INTEGER NOT NULL DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_visits PRIMARY KEY (id),
    CONSTRAINT uq_visits_reference_code UNIQUE (reference_code),
    CONSTRAINT fk_visits_lead
        FOREIGN KEY (lead_id)
        REFERENCES lead.leads (id)
        ON DELETE CASCADE,
    CONSTRAINT chk_visits_booked_by
        CHECK (booked_by IN ('TENANT', 'HANDLER')),
    CONSTRAINT chk_visits_status
        CHECK (status IN ('SCHEDULED', 'CANCELLED', 'VISITED', 'NOT_VISITED')),
    CONSTRAINT chk_visits_slot
        CHECK (slot_start_minute >= 0 AND slot_end_minute <= 1440 AND slot_end_minute > slot_start_minute),
    CONSTRAINT chk_visits_tenant_reschedules
        CHECK (tenant_reschedules BETWEEN 0 AND 2)
);

-- One visit still to happen per lead. A second is refused until the first is
-- moved, cancelled or done.
CREATE UNIQUE INDEX uq_visits_live_per_lead
    ON lead.visits (lead_id)
    WHERE status = 'SCHEDULED';

-- How many places a slot has taken: the count behind "3 spots left".
CREATE INDEX idx_visits_property_date_slot
    ON lead.visits (property_id, visit_date, slot_start_minute)
    WHERE status = 'SCHEDULED';
