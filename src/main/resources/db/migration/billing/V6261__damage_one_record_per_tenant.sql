-- A split is one record per tenant (user, 2026-10-31). They share the damage's
-- code and are told apart by split_number: "DMG-2026-000279, split 2". Each has
-- one tenant, its own cost and at most one bill, so paying, editing or deleting
-- one leaves the others alone. A record that is not a split has no number.
ALTER TABLE billing.damage_records
    ADD COLUMN split_number integer,
    ADD CONSTRAINT chk_damage_record_split_number CHECK (split_number IS NULL OR split_number >= 1);

ALTER TABLE billing.damage_records DROP CONSTRAINT damage_records_code_key;
CREATE UNIQUE INDEX uq_damage_record_code_split ON billing.damage_records (code, COALESCE(split_number, 0));
CREATE INDEX idx_damage_records_code ON billing.damage_records (property_id, code);

-- Records already split: the first share stays on the record, each other share
-- gets a copy of it. Bills and deposit money stay with their share.
CREATE TEMP TABLE damage_split_parts ON COMMIT DROP AS
SELECT s.record_id, s.display_order, s.amount_paise, gen_random_uuid() AS new_id,
       row_number() OVER (PARTITION BY s.record_id ORDER BY s.display_order) AS part
FROM billing.damage_record_shares s
WHERE (SELECT COUNT(*) FROM billing.damage_record_shares o WHERE o.record_id = s.record_id) > 1;

INSERT INTO billing.damage_records (id, code, property_id, room_id, item_name, section, damage_level, cost_paise, note,
        photo_urls, responsibility, source, status, repaired_level, repair_photo_urls, repair_note, repaired_at,
        repaired_by, created_by, created_at, updated_at, version, split_number)
SELECT p.new_id, r.code, r.property_id, r.room_id, r.item_name, r.section, r.damage_level, p.amount_paise, r.note,
       r.photo_urls, r.responsibility, r.source, r.status, r.repaired_level, r.repair_photo_urls, r.repair_note, r.repaired_at,
       r.repaired_by, r.created_by, r.created_at, r.updated_at, r.version, p.part
FROM damage_split_parts p
JOIN billing.damage_records r ON r.id = p.record_id
WHERE p.part > 1;

UPDATE billing.damage_record_shares s
SET record_id = p.new_id, display_order = 0
FROM damage_split_parts p
WHERE s.record_id = p.record_id AND s.display_order = p.display_order AND p.part > 1;

UPDATE billing.damage_record_shares s
SET display_order = 0
FROM damage_split_parts p
WHERE s.record_id = p.record_id AND s.display_order = p.display_order AND p.part = 1;

UPDATE billing.damage_records r
SET cost_paise = p.amount_paise, split_number = 1
FROM damage_split_parts p
WHERE r.id = p.record_id AND p.part = 1;

-- Bills already raised take the new name, in place of "your share".
UPDATE billing.billing_cycle_line_items li
SET label = regexp_replace(li.label, '(, your share)?( \(from deposit\))?$', ', split ' || r.split_number || '\2')
FROM billing.damage_records r
JOIN billing.damage_record_shares s ON s.record_id = r.id
WHERE r.split_number IS NOT NULL AND s.bill_id = li.billing_cycle_id AND li.label LIKE 'Damage ' || r.code || ':%';

UPDATE billing.deposit_movements d
SET reason = regexp_replace(d.reason, '(, your share)?( \(from deposit\))?$', ', split ' || r.split_number || '\2')
FROM billing.damage_records r
JOIN billing.damage_record_shares s ON s.record_id = r.id
JOIN billing.deposit_accounts a ON a.tenancy_id = s.tenancy_id
WHERE r.split_number IS NOT NULL AND a.id = d.deposit_account_id AND d.reason LIKE 'Damage ' || r.code || ':%';

UPDATE billing.billing_cycle_line_items
SET label = replace(label, ', your share', '')
WHERE label LIKE 'Damage DMG-%, your share%';

UPDATE billing.deposit_movements
SET reason = replace(reason, ', your share', '')
WHERE reason LIKE 'Damage DMG-%, your share%';
