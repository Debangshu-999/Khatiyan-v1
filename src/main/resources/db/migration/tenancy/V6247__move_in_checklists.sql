-- The move-in checklist (user, 2026-10-29): the room's condition when a
-- tenant moves in, recorded at onboarding, seen and answered by the tenant.
-- One per stay. Photos 1 to 10. The tenant has 48 hours to accept it or note
-- a difference; unanswered, it counts as accepted (worked out on read).

CREATE TABLE tenancy.move_in_checklists (
    tenancy_id          uuid PRIMARY KEY REFERENCES tenancy.tenancies(id) ON DELETE CASCADE,
    photo_urls          jsonb        NOT NULL,
    keys_handed_over    integer,
    recorded_by_user_id uuid         NOT NULL,
    recorded_at         timestamptz  NOT NULL,
    tenant_response     varchar(20)  NOT NULL DEFAULT 'PENDING',
    tenant_note         varchar(500),
    responded_at        timestamptz,
    version             bigint       NOT NULL DEFAULT 0,
    CONSTRAINT chk_move_in_photos CHECK (
        CASE WHEN jsonb_typeof(photo_urls) = 'array'
             THEN jsonb_array_length(photo_urls) BETWEEN 1 AND 10
             ELSE false END),
    CONSTRAINT chk_move_in_keys CHECK (keys_handed_over IS NULL OR keys_handed_over BETWEEN 0 AND 50),
    CONSTRAINT chk_move_in_response CHECK (
        (tenant_response = 'PENDING' AND responded_at IS NULL AND tenant_note IS NULL)
        OR (tenant_response = 'ACCEPTED' AND responded_at IS NOT NULL AND tenant_note IS NULL)
        OR (tenant_response = 'NOTED' AND responded_at IS NOT NULL AND tenant_note IS NOT NULL))
);

CREATE TABLE tenancy.move_in_checklist_items (
    tenancy_id    uuid        NOT NULL REFERENCES tenancy.move_in_checklists(tenancy_id) ON DELETE CASCADE,
    display_order integer     NOT NULL,
    name          varchar(80) NOT NULL,
    damage_level  varchar(4)  NOT NULL,
    note          varchar(200),
    custom        boolean     NOT NULL DEFAULT false,
    PRIMARY KEY (tenancy_id, display_order),
    CONSTRAINT chk_move_in_item_level CHECK (damage_level IN ('NA', 'D1', 'D2', 'D3'))
);
