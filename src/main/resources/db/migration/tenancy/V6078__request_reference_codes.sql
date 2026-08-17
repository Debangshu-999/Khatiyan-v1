-- Short, user-facing codes for exit and room change requests.
--
-- Both sides were quoting the raw UUID: request cards and notifications printed
-- a truncated tenancy id, which is neither searchable nor safe to read out. A
-- tenant ringing about "TEX-2026-000042" is unambiguous; one reading eight hex
-- characters off a screen is not, and the id they are reading is an internal key
-- that should never have been on display.
--
-- Uses the same shared sequence and format as tenancies, properties, concerns
-- and bills, so codes are globally unique and sort by creation across entities.

ALTER TABLE tenancy.tenancy_exit_requests
    ADD COLUMN IF NOT EXISTS reference_code VARCHAR(40);

UPDATE tenancy.tenancy_exit_requests
SET reference_code = 'TEX-' || EXTRACT(YEAR FROM created_at)::INT || '-'
        || LPAD(nextval('shared.reference_code_seq')::TEXT, 6, '0')
WHERE reference_code IS NULL;

ALTER TABLE tenancy.tenancy_exit_requests
    ALTER COLUMN reference_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tenancy_exit_requests_reference_code
    ON tenancy.tenancy_exit_requests (reference_code);

ALTER TABLE tenancy.tenancy_room_change_requests
    ADD COLUMN IF NOT EXISTS reference_code VARCHAR(40);

UPDATE tenancy.tenancy_room_change_requests
SET reference_code = 'TRC-' || EXTRACT(YEAR FROM created_at)::INT || '-'
        || LPAD(nextval('shared.reference_code_seq')::TEXT, 6, '0')
WHERE reference_code IS NULL;

ALTER TABLE tenancy.tenancy_room_change_requests
    ALTER COLUMN reference_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tenancy_room_change_requests_reference_code
    ON tenancy.tenancy_room_change_requests (reference_code);
