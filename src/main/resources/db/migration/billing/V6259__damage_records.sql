-- Damage records (user, 2026-10-29): a damage to one item in one room, who
-- answers for it, the level it brought the item to and what it costs.
-- Charged once on a one-off bill per share, or left for exit settlement.
CREATE TABLE billing.damage_records (
    id                uuid         PRIMARY KEY,
    code              varchar(20)  NOT NULL UNIQUE,
    property_id       uuid         NOT NULL,
    room_id           uuid         NOT NULL,
    item_name         varchar(80)  NOT NULL,
    section           varchar(10)  NOT NULL,
    damage_level      varchar(4)   NOT NULL,
    cost_paise        bigint       NOT NULL,
    note              varchar(300),
    photo_urls        jsonb        NOT NULL,
    responsibility    varchar(10)  NOT NULL,
    source            varchar(10)  NOT NULL,
    status            varchar(10)  NOT NULL,
    repaired_level    varchar(4),
    repair_photo_urls jsonb,
    repair_note       varchar(300),
    repaired_at       timestamptz,
    repaired_by       uuid,
    created_by        uuid         NOT NULL,
    created_at        timestamptz  NOT NULL,
    updated_at        timestamptz  NOT NULL,
    version           bigint       NOT NULL DEFAULT 0,
    CONSTRAINT chk_damage_record_section CHECK (section IN ('ROOM', 'BATHROOM')),
    CONSTRAINT chk_damage_record_level CHECK (damage_level IN ('NA', 'D1', 'D2', 'D3')),
    CONSTRAINT chk_damage_record_repaired_level CHECK (repaired_level IS NULL OR repaired_level IN ('NA', 'D1', 'D2', 'D3')),
    CONSTRAINT chk_damage_record_cost CHECK (cost_paise >= 0),
    CONSTRAINT chk_damage_record_responsibility CHECK (responsibility IN ('TENANT', 'SPLIT', 'NONE')),
    CONSTRAINT chk_damage_record_source CHECK (source IN ('MANUAL', 'MOVE_IN')),
    CONSTRAINT chk_damage_record_status CHECK (status IN ('OPEN', 'REPAIRED', 'REPLACED'))
);

CREATE INDEX idx_damage_records_property_status
    ON billing.damage_records (property_id, status, created_at DESC);

-- One tenant's part: all of it, or an equal share of a split, and its bill.
CREATE TABLE billing.damage_record_shares (
    record_id      uuid         NOT NULL REFERENCES billing.damage_records(id) ON DELETE CASCADE,
    display_order  integer      NOT NULL,
    tenancy_id     uuid         NOT NULL,
    tenant_user_id uuid,
    tenant_name    varchar(120) NOT NULL,
    amount_paise   bigint       NOT NULL,
    bill_id        uuid,
    PRIMARY KEY (record_id, display_order),
    CONSTRAINT chk_damage_share_amount CHECK (amount_paise >= 0)
);

CREATE INDEX idx_damage_record_shares_tenancy ON billing.damage_record_shares (tenancy_id);
