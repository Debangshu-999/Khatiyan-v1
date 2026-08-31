-- Gender gains TRANSGENDER and UNDECLARED.
--
-- V6110 constrained the column to MALE/FEMALE/OTHER. Indian forms are expected
-- to carry a third option — NALSA (2014) requires one on official records, and
-- leaving people to select "Other" is exactly what that judgment was about.
--
-- UNDECLARED is a deliberate answer rather than the absence of one: someone who
-- picks it has been asked and declined, where a NULL means they were never asked.
-- Both print nothing on a deed, but only one should be prompted for again.
--
-- Widening only. No existing value is invalidated, so nothing needs rewriting.

ALTER TABLE auth.users
    DROP CONSTRAINT users_gender_check;

ALTER TABLE auth.users
    ADD CONSTRAINT users_gender_check
        CHECK (gender IS NULL OR gender IN ('MALE', 'FEMALE', 'TRANSGENDER', 'OTHER', 'UNDECLARED'));
