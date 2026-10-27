-- Duplicate and potential spam leads are marked by a rule, not by the owner
-- (user, 2026-10-17).
--
-- ended_by_prospect  the record ended for the person's own reason: they did
--                    not reply when someone tried, booked no visit, said not
--                    interested, dropped their visit, let the days to book run
--                    out, or walked away from a booking. Never when the
--                    property did not respond, cancelled or could not host.
-- earlier_walkaways  how many of the person's earlier records here ended so,
--                    since they last moved in, counted when this one opened.
--                    One or two make it a duplicate, three or more potential
--                    spam. Never changed after.
-- duplicate_of       now the latest of those earlier records.
ALTER TABLE lead.leads
    ADD COLUMN ended_by_prospect BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN earlier_walkaways INTEGER NOT NULL DEFAULT 0;

ALTER TABLE lead.leads
    ADD CONSTRAINT chk_leads_earlier_walkaways CHECK (earlier_walkaways >= 0),
    ADD CONSTRAINT chk_leads_ended_by_prospect CHECK (state = 'CLOSED' OR ended_by_prospect = FALSE);

-- Endings that are always the person's.
UPDATE lead.leads
SET ended_by_prospect = TRUE
WHERE state = 'CLOSED'
  AND close_reason IN ('NO_VISIT_BOOKED', 'NOT_INTERESTED', 'NO_ANSWER_AFTER_MISSED_VISIT', 'NOT_SURE_EXPIRED',
                       'BOOKING_WINDOW_EXPIRED', 'NO_LONGER_LOOKING', 'BOOKING_CANCELLED_BY_TENANT',
                       'DID_NOT_ARRIVE', 'DID_NOT_SIGN', 'BOOKED_ELSEWHERE');

-- Never answered: theirs only where someone did try to reach them.
UPDATE lead.leads record
SET ended_by_prospect = TRUE
WHERE record.state = 'CLOSED'
  AND record.close_reason = 'NO_REPLY'
  AND EXISTS (
      SELECT 1
      FROM lead.lead_enquiries link
      JOIN enquiry.enquiries enquiry ON enquiry.id = link.enquiry_id
      WHERE link.lead_id = record.id
        AND enquiry.end_reason = 'TENANT_DID_NOT_RESPOND');

-- Visit cancelled and never booked again: theirs only where they cancelled it.
UPDATE lead.leads record
SET ended_by_prospect = TRUE
WHERE record.state = 'CLOSED'
  AND record.close_reason = 'VISIT_CANCELLED'
  AND (
      SELECT visit.cancelled_by
      FROM lead.visits visit
      WHERE visit.lead_id = record.id
        AND visit.status = 'CANCELLED'
      ORDER BY visit.cancelled_at DESC NULLS LAST
      LIMIT 1) = 'TENANT';

-- Each record counts the earlier ones its person walked away from, since they last moved in here.
UPDATE lead.leads record
SET earlier_walkaways = counted.walkaways,
    duplicate_of_lead_id = counted.latest_id
FROM (
    SELECT later.id,
           COUNT(earlier.id) AS walkaways,
           (array_agg(earlier.id ORDER BY earlier.closed_at DESC))[1] AS latest_id
    FROM lead.leads later
    JOIN lead.leads earlier
      ON earlier.property_id = later.property_id
     AND earlier.prospect_user_id = later.prospect_user_id
     AND earlier.id <> later.id
     AND earlier.ended_by_prospect
     AND earlier.closed_at <= later.created_at
     AND earlier.closed_at > COALESCE((
            SELECT max(moved.closed_at)
            FROM lead.leads moved
            WHERE moved.property_id = later.property_id
              AND moved.prospect_user_id = later.prospect_user_id
              AND moved.close_reason = 'CONVERTED'
              AND moved.closed_at <= later.created_at), '-infinity'::timestamptz)
    GROUP BY later.id
) counted
WHERE counted.id = record.id;

-- A repeat is not also a resumed lead: resumed is kept for the endings that were not the person's.
UPDATE lead.leads
SET resumed_from_lead_id = NULL
WHERE earlier_walkaways > 0;

