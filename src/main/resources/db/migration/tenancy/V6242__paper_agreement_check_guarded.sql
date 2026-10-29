-- V6241's paper-agreement check tested the photos' type and their count in one
-- AND. Postgres does not promise to evaluate the type test first, and
-- jsonb_array_length raises on anything but an array, so a stray non-array
-- value could fail the row with an error instead of the check (2026-10-28).
-- The same rule, with the count behind a CASE.

ALTER TABLE tenancy.tenancies
    DROP CONSTRAINT chk_tenancies_paper_agreement;

ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_paper_agreement CHECK (
        (agreement_on_paper
            AND paper_agreement_photo_urls IS NOT NULL
            AND CASE WHEN jsonb_typeof(paper_agreement_photo_urls) = 'array'
                     THEN jsonb_array_length(paper_agreement_photo_urls) BETWEEN 1 AND 10
                     ELSE false END)
        OR (NOT agreement_on_paper AND paper_agreement_photo_urls IS NULL));
