-- Existing-tenant onboarding (P1.1, 2026-10-28): a person already living in a
-- running PG brought onto Khatiyan from their next bill.
--
--   transitioned               the stay was carried over, not started here.
--   moved_in_on                when they really moved in, before Khatiyan.
--                              start_date stays the first Khatiyan bill's day.
--   opening_dues_paise/_note   what they owed at the switch, raised as an
--                              opening one-off bill when billing starts.
--   agreement_on_paper         their paper agreement carries over: photos of
--                              it are on file and no deed is signed in the app.
--   paper_agreement_photo_urls those photos, 1 to 10.
--
-- The deposit needs no column: on a transitioned stay deposit_amount_paise is
-- the deposit already held, opened in the ledger as carried over, never billed.

ALTER TABLE tenancy.tenancies
    ADD COLUMN transitioned boolean NOT NULL DEFAULT false,
    ADD COLUMN moved_in_on date,
    ADD COLUMN opening_dues_paise bigint,
    ADD COLUMN opening_dues_note varchar(120),
    ADD COLUMN agreement_on_paper boolean NOT NULL DEFAULT false,
    ADD COLUMN paper_agreement_photo_urls jsonb;

-- A carried-over stay is monthly and moved in before its first Khatiyan bill.
-- Every other stay carries none of the transition fields.
ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_transition_shape CHECK (
        (transitioned
            AND billing_type = 'MONTHLY'
            AND moved_in_on IS NOT NULL
            AND moved_in_on < start_date)
        OR (NOT transitioned
            AND moved_in_on IS NULL
            AND opening_dues_paise IS NULL
            AND opening_dues_note IS NULL
            AND NOT agreement_on_paper
            AND paper_agreement_photo_urls IS NULL));

ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_opening_dues CHECK (
        opening_dues_paise IS NULL OR opening_dues_paise > 0);

-- A paper agreement is on file only with its photos, and photos only with it.
ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_paper_agreement CHECK (
        (agreement_on_paper
            AND paper_agreement_photo_urls IS NOT NULL
            AND jsonb_typeof(paper_agreement_photo_urls) = 'array'
            AND jsonb_array_length(paper_agreement_photo_urls) BETWEEN 1 AND 10)
        OR (NOT agreement_on_paper AND paper_agreement_photo_urls IS NULL));
