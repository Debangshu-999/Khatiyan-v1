-- One visit per enquiry (owner's rule, 2026-10-03).
--
-- A person books one visit at a property and cannot book another until the
-- enquiry behind it has expired. That holds whether the visit is still to
-- happen, happened, or was missed: missing it does not earn a second one.
--
-- So the rule the database keeps is "one visit per enquiry, whatever its
-- status", not "one SCHEDULED visit per lead". The old index would also have
-- got in the way: a visit whose date has passed still says SCHEDULED until it
-- is reviewed, and it must not block the visit booked on the person's next
-- enquiry.
DROP INDEX lead.uq_visits_live_per_lead;

CREATE UNIQUE INDEX uq_visits_one_per_enquiry
    ON lead.visits (enquiry_id)
    WHERE enquiry_id IS NOT NULL;

-- A lead's visits, newest first: what the booking guard and the chat bar read.
CREATE INDEX idx_visits_lead_created
    ON lead.visits (lead_id, created_at DESC);
