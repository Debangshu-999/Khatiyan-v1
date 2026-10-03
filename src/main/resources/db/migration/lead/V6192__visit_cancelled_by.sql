-- Who cancelled a visit, and when (2026-10-03).
--
-- A visit rebooked on the same enquiry after the TENANT cancelled starts with
-- the reschedules the cancelled one had left (owner's rule), so cancelling and
-- rebooking cannot reset them. After the property cancels, a rebooking starts
-- fresh: that was the property's call. So the side that cancelled is kept.
--
-- Null on visits cancelled before this existed.
ALTER TABLE lead.visits
    ADD COLUMN cancelled_by VARCHAR(10),
    ADD COLUMN cancelled_at TIMESTAMPTZ,
    ADD CONSTRAINT chk_visits_cancelled_by
        CHECK (cancelled_by IS NULL OR cancelled_by IN ('TENANT', 'HANDLER'));
