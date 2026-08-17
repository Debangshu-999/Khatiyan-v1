-- Request lifecycle: expiry, two-stage withdrawal, and the re-raise carve-out.
--
-- Three gaps closed here:
--
-- 1. A request nobody reviewed sat in REQUESTED forever. It now EXPIREs after
--    the review window. Expiry is inert on purpose -- no notice, no skipped
--    cycle, no tenancy change -- because auto-approve would put a tenant on
--    notice through inaction, and auto-reject would reward a stonewalling owner.
--
-- 2. An approved exit could not be undone. It now can, but only with the
--    owner's agreement and only briefly, since they may have re-let the bed.
--
-- 3. An expired or rejected exit could not be re-raised until the next payment
--    window, ~26 days later, so ignoring a request cost the tenant a month.
--    A re-raise may now skip the window gate and keep the ORIGINAL request date
--    as its notice anchor.

-- --------------------------------------------------------------------------
-- Statuses
-- --------------------------------------------------------------------------

ALTER TABLE tenancy.tenancy_exit_requests
    DROP CONSTRAINT IF EXISTS chk_tenancy_exit_requests_status;

ALTER TABLE tenancy.tenancy_exit_requests
    ADD CONSTRAINT chk_tenancy_exit_requests_status
        CHECK (status IN (
            'REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXECUTED',
            'EXPIRED', 'WITHDRAWAL_REQUESTED'));

-- Room changes get EXPIRED but never WITHDRAWAL_REQUESTED: an approved room
-- change is not reversible, which is already what `cancel` enforces.
ALTER TABLE tenancy.tenancy_room_change_requests
    DROP CONSTRAINT IF EXISTS chk_tenancy_room_change_requests_status;

ALTER TABLE tenancy.tenancy_room_change_requests
    ADD CONSTRAINT chk_tenancy_room_change_requests_status
        CHECK (status IN (
            'REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXECUTED',
            'EXPIRED'));

-- --------------------------------------------------------------------------
-- Withdrawal of an approved exit
-- --------------------------------------------------------------------------

ALTER TABLE tenancy.tenancy_exit_requests
    ADD COLUMN IF NOT EXISTS withdrawal_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS withdrawal_reason VARCHAR(500),
    ADD COLUMN IF NOT EXISTS withdrawal_decided_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS withdrawal_decided_by_user_id UUID,
    ADD COLUMN IF NOT EXISTS withdrawal_admin_notes VARCHAR(500);

-- --------------------------------------------------------------------------
-- Re-raise carve-out
-- --------------------------------------------------------------------------

-- The date the notice period counts from. Normally the request's own creation
-- date; on a re-raise after expiry or rejection it is inherited from the
-- superseded request, so an owner who lets a request lapse cannot cost the
-- tenant notice time. Backfilled from created_at so it is never null and Phase 3
-- can read it unconditionally.
ALTER TABLE tenancy.tenancy_exit_requests
    ADD COLUMN IF NOT EXISTS notice_anchor_date DATE;

UPDATE tenancy.tenancy_exit_requests
SET notice_anchor_date = (created_at AT TIME ZONE 'Asia/Kolkata')::date
WHERE notice_anchor_date IS NULL;

ALTER TABLE tenancy.tenancy_exit_requests
    ALTER COLUMN notice_anchor_date SET NOT NULL;

-- The request this one re-raises, so the chain is walkable from newest back to
-- the original. The UI stacks a chain into one card rather than showing an
-- owner three unrelated-looking exit requests from the same tenant.
ALTER TABLE tenancy.tenancy_exit_requests
    ADD COLUMN IF NOT EXISTS superseded_request_id UUID;

ALTER TABLE tenancy.tenancy_exit_requests
    DROP CONSTRAINT IF EXISTS fk_tenancy_exit_requests_superseded;

ALTER TABLE tenancy.tenancy_exit_requests
    ADD CONSTRAINT fk_tenancy_exit_requests_superseded
        FOREIGN KEY (superseded_request_id)
        REFERENCES tenancy.tenancy_exit_requests (id);

-- A request cannot supersede itself.
ALTER TABLE tenancy.tenancy_exit_requests
    DROP CONSTRAINT IF EXISTS chk_tenancy_exit_requests_supersedes_other;

ALTER TABLE tenancy.tenancy_exit_requests
    ADD CONSTRAINT chk_tenancy_exit_requests_supersedes_other
        CHECK (superseded_request_id IS NULL OR superseded_request_id <> id);

CREATE INDEX IF NOT EXISTS idx_tenancy_exit_requests_superseded
    ON tenancy.tenancy_exit_requests (superseded_request_id)
    WHERE superseded_request_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- Open-request guards
-- --------------------------------------------------------------------------

-- WITHDRAWAL_REQUESTED is an OPEN state: the exit is still live and the tenancy
-- is still on notice while the owner decides, so it must keep blocking a second
-- request. Leaving it out would let a tenant hold an approved exit, ask to
-- withdraw it, and raise a fresh exit alongside.
DROP INDEX IF EXISTS tenancy.uk_tenancy_exit_requests_one_open;

CREATE UNIQUE INDEX IF NOT EXISTS uk_tenancy_exit_requests_one_open
    ON tenancy.tenancy_exit_requests (tenancy_id)
    WHERE status IN ('REQUESTED', 'APPROVED', 'WITHDRAWAL_REQUESTED');

-- Drives the expiry sweep: pending requests ordered by age.
CREATE INDEX IF NOT EXISTS idx_tenancy_exit_requests_pending_review
    ON tenancy.tenancy_exit_requests (status, created_at)
    WHERE status = 'REQUESTED';

CREATE INDEX IF NOT EXISTS idx_tenancy_room_change_requests_pending_review
    ON tenancy.tenancy_room_change_requests (status, created_at)
    WHERE status = 'REQUESTED';
