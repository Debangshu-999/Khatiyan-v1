-- When a request stops being interactive, as a stored fact rather than a guess.
--
-- "Active" now means "raised and not yet expired", which is NOT the same as
-- "undecided": an approved exit stays interactive for its 3-day withdrawal
-- window, and a rejected one for its 3-day re-raise window. Both belong in the
-- active list with their decision showing, and only drop into history once the
-- window shuts.
--
-- This is a separate column rather than a status, deliberately. An approved exit
-- must STAY 'APPROVED' after its withdrawal window closes, because that is the
-- status the execution scheduler looks for — overwriting it with 'EXPIRED' would
-- silently strand every approved departure. Status answers "what was decided";
-- expires_at answers "is there anything left to do about it".
--
-- Room changes expire the moment they are approved: there is no withdrawal
-- after approval, so nothing stays interactive.

ALTER TABLE tenancy.tenancy_exit_requests
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE tenancy.tenancy_exit_requests
SET expires_at = CASE
        WHEN status = 'REQUESTED' THEN created_at + INTERVAL '5 days'
        WHEN status = 'WITHDRAWAL_REQUESTED' THEN NULL
        WHEN status IN ('APPROVED', 'REJECTED') AND decided_at IS NOT NULL
            THEN decided_at + INTERVAL '3 days'
        ELSE updated_at
    END
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenancy_exit_requests_expires_at
    ON tenancy.tenancy_exit_requests (property_id, expires_at);

ALTER TABLE tenancy.tenancy_room_change_requests
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE tenancy.tenancy_room_change_requests
SET expires_at = CASE
        WHEN status = 'REQUESTED' THEN created_at + INTERVAL '5 days'
        WHEN decided_at IS NOT NULL THEN decided_at
        ELSE updated_at
    END
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenancy_room_change_requests_expires_at
    ON tenancy.tenancy_room_change_requests (property_id, expires_at);
