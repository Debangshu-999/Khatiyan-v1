-- A cancelled visit no longer counts as the enquiry's one visit (owner's rule,
-- 2026-10-03). Cancelling puts the person back at Enquired, and they may book
-- again before the enquiry expires. A visit still to happen, done or missed
-- still counts: a missed visit is moved, not booked again.
DROP INDEX lead.uq_visits_one_per_enquiry;

CREATE UNIQUE INDEX uq_visits_one_per_enquiry
    ON lead.visits (enquiry_id)
    WHERE enquiry_id IS NOT NULL AND status <> 'CANCELLED';
