-- A booking made outside the app (2026-10-19): someone who booked in person or
-- by phone, recorded by the property as a confirmed booking. It belongs to an
-- external record in the lead module, has no enquiry, and has no account until
-- move-in, when onboarding makes one and the booking is linked to it.
--
-- Spec: docs/superpowers/specs/2026-10-19-external-visits-and-bookings-design.md
-- Immutable from first write: a correction is a later Flyway version.

ALTER TABLE booking.requests
    ALTER COLUMN prospect_user_id DROP NOT NULL,
    ALTER COLUMN enquiry_id DROP NOT NULL,
    -- lead.external_prospects(id). No foreign key across modules.
    ADD COLUMN external_prospect_id UUID,
    ADD COLUMN reached_via VARCHAR(20),
    ADD CONSTRAINT chk_requests_reached_via CHECK (reached_via IS NULL OR reached_via IN ('WALKED_IN', 'PHONE_CALL')),
    -- An app booking has its person and its enquiry. An external one has its record and how they reached out.
    ADD CONSTRAINT chk_requests_whose CHECK (
        (external_prospect_id IS NULL AND prospect_user_id IS NOT NULL AND enquiry_id IS NOT NULL)
        OR (external_prospect_id IS NOT NULL AND reached_via IS NOT NULL));
