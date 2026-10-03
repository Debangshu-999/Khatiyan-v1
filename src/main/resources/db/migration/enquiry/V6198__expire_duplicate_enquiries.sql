-- Expires the duplicate enquiries a closed enquiry let through (2026-10-03).
--
-- Closing an enquiry kept its RESPONDED status, and raising one only refused
-- while an enquiry was still NEW, so a tenant whose enquiry had closed (or had
-- merely been answered) could raise a second one for the same property. Both
-- stayed on the owner's list, and only the newest could be acted on.
--
-- The rule now is one current enquiry per tenant per property: raising a new
-- one expires any closed one first. This applies that rule to what is already
-- there: of each tenant's not-yet-expired enquiries at a property, the newest
-- stays and the older ones expire now. Their end reason is kept, so an expired
-- card still says why it ended; a NEW one also takes the EXPIRED status, as the
-- expiry sweep would give it.
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY property_id, enquirer_user_id
               ORDER BY created_at DESC, id DESC
           ) AS position
    FROM enquiry.enquiries
    WHERE status <> 'EXPIRED'
      AND (expires_at IS NULL OR expires_at > now())
)
UPDATE enquiry.enquiries e
SET expires_at = now(),
    status = CASE WHEN e.status = 'NEW' THEN 'EXPIRED' ELSE e.status END,
    version = e.version + 1,
    updated_at = now()
FROM ranked
WHERE e.id = ranked.id
  AND ranked.position > 1;
