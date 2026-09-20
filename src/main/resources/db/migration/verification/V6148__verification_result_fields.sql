-- What a passed check actually establishes, after the first cut proved to be
-- asking the wrong questions.
--
-- Date of birth is no longer matched against what the owner typed. Nobody needs
-- the two to agree — what a tenancy needs to know is that the person is an
-- adult, and UIDAI's date is the authority on that. Comparing it to a
-- hand-entered date only ever produced failures about typing.
--
-- Gender is gone entirely. It is optional in the app, so half the tenancies have
-- nothing to compare against, and a check that silently passes when a field is
-- empty is not a check.
ALTER TABLE verification.verification_grants
    -- The Aadhaar-linked mobile against the phone this tenant signed in with.
    -- UIDAI hashes the mobile rather than returning it, but the hash is
    -- reproducible from a number we already hold, so this is verifiable without
    -- anybody sending us a phone number to trust.
    --
    -- NULL means we could not tell: no hash came back, or no share code was
    -- used. FALSE is not a failure of the check — people routinely register
    -- with a different number from the one on their Aadhaar — it is a fact the
    -- owner may want to know.
    ADD COLUMN phone_matched BOOLEAN,

    -- The address UIDAI holds, which becomes the tenant's address in the app
    -- rather than being compared with it. A free-text address typed into a form
    -- and a structured one from a government record will never agree
    -- character-for-character, and the government's is the one worth keeping.
    ADD COLUMN verified_address VARCHAR(300),
    ADD COLUMN verified_address_pincode VARCHAR(6),

    -- Established from the returned date of birth at the moment of the check.
    -- Stored rather than recomputed because "were they an adult when this
    -- tenancy was created" is the question a dispute asks, and that answer must
    -- not change with the calendar.
    ADD COLUMN adult_at_verification BOOLEAN;
