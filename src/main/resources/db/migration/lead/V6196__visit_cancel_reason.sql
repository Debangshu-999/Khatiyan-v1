-- Why a visit was cancelled (owner's design, 2026-10-03).
--
-- Cancelling now asks whoever cancels whether the person is still interested,
-- and for a reason, which is required. The owner's card shows the reason under
-- the intent line. Null on visits cancelled before this existed.
ALTER TABLE lead.visits
    ADD COLUMN cancel_reason VARCHAR(500);
