-- Tenancies left with no agreement to accept.
--
-- PENDING_ACCEPTANCE leaves that state by exactly one route: the tenant accepting
-- their agreement. V6112 deleted every agreement, so any tenancy still pending is
-- now permanently unacceptable — and it is holding a reserved bed while it waits
-- for something that can never happen.
--
-- Nothing is lost. Nobody had signed; these are offers that were never taken up.
-- ACTIVE tenancies are untouched and keep running.
--
-- Identified by status alone rather than by joining to agreements, because
-- V6112 has already destroyed the evidence of which ones they were. Status is
-- the better test anyway: it IS the definition of stranded here.

-- Release the beds FIRST, while the rows that say which beds are still readable.
-- Decrementing reserved_count, not occupied_count: a pending tenant has not moved
-- in. And decrementing by the counted total rather than resetting to zero — a
-- blanket reset would also wipe reservations held by approved room changes, which
-- have nothing to do with agreements.
UPDATE property.rooms r
SET reserved_count = GREATEST(0, r.reserved_count - stranded.held)
FROM (SELECT room_id, COUNT(*) AS held
      FROM tenancy.tenancies
      WHERE status = 'PENDING_ACCEPTANCE'
        AND is_active = TRUE
      GROUP BY room_id) AS stranded
WHERE r.id = stranded.room_id;

UPDATE tenancy.tenancies
SET status      = 'EXITED',
    is_active   = FALSE,
    end_date    = CURRENT_DATE,
    exit_reason = 'Cancelled: agreement model replaced before the tenant accepted'
WHERE status = 'PENDING_ACCEPTANCE'
  AND is_active = TRUE;
