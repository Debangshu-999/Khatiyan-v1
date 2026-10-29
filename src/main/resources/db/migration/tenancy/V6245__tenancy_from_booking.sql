-- A stay onboarded from a booking (user, 2026-10-29). Its pending agreement
-- cannot be removed by the owner or a manager: onboarding a booking and then
-- removing the stay at once would keep the token while the tenant lost the bed.
-- The tenant may still decline, and an unsigned agreement still expires.

ALTER TABLE tenancy.tenancies
    ADD COLUMN from_booking boolean NOT NULL DEFAULT false;

UPDATE tenancy.tenancies t
SET from_booking = true
FROM booking.requests r
WHERE r.tenancy_id = t.id;
