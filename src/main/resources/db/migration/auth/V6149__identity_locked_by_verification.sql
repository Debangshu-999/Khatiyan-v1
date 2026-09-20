-- Once a government record has established who somebody is, the app stops
-- letting them say otherwise.
--
-- Name, date of birth and permanent address are written from the verified
-- Aadhaar record and then frozen. Leaving them editable would make the whole
-- exercise decorative: a tenant could pass a check as one person and rename
-- themselves the next day, and every agreement, notice and deposit dispute
-- afterwards would cite a name no document supports.
--
-- Deliberately a one-way door. There is no unlock in the app, because an unlock
-- an owner or a tenant can reach is not a lock. Correcting a genuinely wrong
-- record is a support action against the database, which is rare enough to be
-- worth the friction and important enough to leave a trail.
ALTER TABLE auth.users
    ADD COLUMN identity_verified_at TIMESTAMPTZ,
    -- Which check established it, so a record can say what it rests on years
    -- later, when the provider and possibly the whole flow have changed.
    ADD COLUMN identity_verified_source VARCHAR(40);

COMMENT ON COLUMN auth.users.identity_verified_at IS
    'Set when a verification wrote this user''s name, date of birth and address from a government record. Non-null means those four fields are frozen.';
