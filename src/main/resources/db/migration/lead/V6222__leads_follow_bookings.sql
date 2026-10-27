-- The lead follows visits and bookings past Early lead, and gains its kinds
-- (2026-10-11, docs/superpowers/specs/2026-10-11-leads-module-design.md).
--
-- became_lead_at   the first time a visit was scheduled. Never cleared, unlike
--                  early_lead_at, which goes when the visit is cancelled. It is
--                  what tells a dead lead from an enquiry that was never one.
-- resumed_from     the person's earlier record here, which ended without a
--                  move-in. A new record that carries it is a resumed lead.
-- reopened_at      "Changed your mind?" opened this same record again. Also a
--                  resumed lead.
-- duplicate_of     the lead this one repeats, where the owner named it.
ALTER TABLE lead.leads
    ADD COLUMN became_lead_at TIMESTAMPTZ,
    ADD COLUMN resumed_from_lead_id UUID,
    ADD COLUMN reopened_at TIMESTAMPTZ,
    ADD COLUMN duplicate_of_lead_id UUID;

ALTER TABLE lead.leads
    ADD CONSTRAINT fk_leads_resumed_from
        FOREIGN KEY (resumed_from_lead_id) REFERENCES lead.leads (id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_leads_duplicate_of
        FOREIGN KEY (duplicate_of_lead_id) REFERENCES lead.leads (id) ON DELETE SET NULL;

-- Records that already had a visit scheduled became leads when the first was
-- booked, whatever happened to it afterwards.
UPDATE lead.leads record
SET became_lead_at = booked.first_booked_at
FROM (
    SELECT lead_id, min(created_at) AS first_booked_at
    FROM lead.visits
    GROUP BY lead_id
) booked
WHERE booked.lead_id = record.id;

-- Records opened after the same person's earlier one here had ended without a
-- move-in are resumed leads. The latest such earlier record is the one linked.
UPDATE lead.leads record
SET resumed_from_lead_id = (
    SELECT earlier.id
    FROM lead.leads earlier
    WHERE earlier.property_id = record.property_id
      AND earlier.prospect_user_id = record.prospect_user_id
      AND earlier.id <> record.id
      AND earlier.state = 'CLOSED'
      AND earlier.close_reason NOT IN ('CONVERTED', 'SPAM', 'DUPLICATE')
      AND earlier.closed_at <= record.created_at
    ORDER BY earlier.closed_at DESC
    LIMIT 1
);

-- While a booking is live its handler is the lead's handler.
ALTER TABLE lead.leads
    DROP CONSTRAINT chk_leads_handler_assigned_by;

ALTER TABLE lead.leads
    ADD CONSTRAINT chk_leads_handler_assigned_by
        CHECK (handler_assigned_by IS NULL
            OR handler_assigned_by IN ('FIRST_RESPONSE', 'SYSTEM', 'OWNER', 'BOOKING'));

-- A person's ended records at a property, newest first: the lookup that links
-- a resumed lead to the one before it.
CREATE INDEX idx_leads_property_prospect_closed
    ON lead.leads (property_id, prospect_user_id, closed_at DESC)
    WHERE state = 'CLOSED';

-- A booking's steps on the timeline: requested, agreed, confirmed, ended,
-- moved in. Each is written once per booking however often it is heard of.
ALTER TABLE lead.lead_activities
    ADD COLUMN booking_request_id UUID;

CREATE UNIQUE INDEX uq_lead_activities_booking_step
    ON lead.lead_activities (lead_id, type, booking_request_id)
    WHERE booking_request_id IS NOT NULL;
