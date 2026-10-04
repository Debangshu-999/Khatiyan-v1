-- Two more ways an enquiry ends, now that a visit is either attended or not
-- (user, 2026-10-04):
--
-- VISIT_MISSED: nobody checked them in, the visit became No visit, and they
-- said they were no longer interested or did not answer within the week.
--
-- VISITED: they came, and the enquiry then ran out.
ALTER TABLE enquiry.enquiries
    DROP CONSTRAINT chk_enquiries_end_reason,
    ADD CONSTRAINT chk_enquiries_end_reason
        CHECK (end_reason IS NULL OR end_reason IN (
            'HANDLER_DID_NOT_RESPOND', 'TENANT_DID_NOT_RESPOND', 'NOT_INTERESTED',
            'NO_VISIT_BOOKED', 'VISIT_CANCELLED', 'VISIT_BOOKED',
            'VISIT_MISSED', 'VISITED'));
