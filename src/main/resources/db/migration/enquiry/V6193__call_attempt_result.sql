-- How a call went, as the handler records it (owner's design, 2026-10-03).
--
-- "Record response" offers four answers. The first two end the call as a
-- failed attempt, the last two as a success that also sets the handler's
-- reading of the enquirer. The answer itself is kept, so the action log can
-- say "Rejected call" rather than only "failed".
--
-- duration_seconds is optional: an accepted call may say how long it ran.
ALTER TABLE enquiry.enquiry_responses
    ADD COLUMN call_result VARCHAR(30),
    ADD COLUMN duration_seconds INTEGER,
    ADD CONSTRAINT chk_enquiry_responses_call_result
        CHECK (call_result IS NULL
            OR call_result IN ('NO_ANSWER', 'REJECTED', 'ACCEPTED_INTERESTED', 'ACCEPTED_NOT_INTERESTED')),
    ADD CONSTRAINT chk_enquiry_responses_duration
        CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 86399);
