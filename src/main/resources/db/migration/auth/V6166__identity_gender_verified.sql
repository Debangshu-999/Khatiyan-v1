-- Gender joins the identity lock (owner's rule, 2026-09-27). An Aadhaar App
-- check returns the gender on the credential; once adopted, it closes behind
-- the name and date of birth and the app can no longer change it.
--
-- A flag rather than reading "is the identity locked": accounts verified before
-- today were verified by a check that never returned a gender, so their gender
-- is still the person's own answer and stays editable.
ALTER TABLE auth.users
    ADD COLUMN identity_gender_verified BOOLEAN NOT NULL DEFAULT FALSE;
