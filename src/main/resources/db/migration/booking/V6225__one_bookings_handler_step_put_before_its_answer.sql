-- One booking's history, put right (user, 2026-10-11: "move this handler
-- assigned to before Terms agreed and time as 3:42 am").
--
-- BKG-2026-000263 had its terms agreed by its owner at 3:50 am on 11 October,
-- while an owner answering a request took nothing. Its "Handler assigned" step
-- was only written at 5:42 pm, by a rule that lasted an afternoon and gave a
-- request to whoever opened it. The rule now is that the first to respond
-- handles it, so the step belongs before that answer. The time is the owner's
-- own word.
--
-- Keyed on that one booking's id. A database that does not hold it is left
-- exactly as it was.
UPDATE booking.actions
SET occurred_at = TIMESTAMPTZ '2026-10-11 03:42:00+05:30'
WHERE request_id = '5ffd4898-babe-4e1a-9789-44a75785257e'
  AND type = 'ASSIGNED';

UPDATE booking.requests
SET handler_assigned_at = TIMESTAMPTZ '2026-10-11 03:42:00+05:30'
WHERE id = '5ffd4898-babe-4e1a-9789-44a75785257e'
  AND handler_user_id IS NOT NULL;
