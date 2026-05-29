ALTER TABLE billing.billing_cycle_line_items
    ALTER COLUMN billing_cycle_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS tenancy_id UUID,
    ADD COLUMN IF NOT EXISTS tenant_user_id UUID,
    ADD COLUMN IF NOT EXISTS property_id UUID,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ADDED';

UPDATE billing.billing_cycle_line_items line_item
SET tenancy_id = cycle.tenancy_id,
    tenant_user_id = cycle.tenant_user_id,
    property_id = cycle.property_id
FROM billing.billing_cycles cycle
WHERE line_item.billing_cycle_id = cycle.id
  AND line_item.tenancy_id IS NULL;

ALTER TABLE billing.billing_cycle_line_items
    ALTER COLUMN tenancy_id SET NOT NULL,
    ALTER COLUMN tenant_user_id SET NOT NULL,
    ALTER COLUMN property_id SET NOT NULL;

ALTER TABLE billing.billing_cycle_line_items
    ADD CONSTRAINT chk_billing_cycle_line_items_status
        CHECK (status IN ('PENDING', 'ADDED', 'CANCELLED'));

ALTER TABLE billing.billing_cycle_line_items
    ADD CONSTRAINT chk_billing_cycle_line_items_cycle_status
        CHECK (
            (status = 'ADDED' AND billing_cycle_id IS NOT NULL)
            OR (status IN ('PENDING', 'CANCELLED'))
        );

CREATE INDEX IF NOT EXISTS idx_billing_cycle_line_items_cycle_added
    ON billing.billing_cycle_line_items (billing_cycle_id, display_order)
    WHERE status = 'ADDED';

CREATE INDEX IF NOT EXISTS idx_billing_cycle_line_items_pending_tenancy_created
    ON billing.billing_cycle_line_items (tenancy_id, created_at)
    WHERE status = 'PENDING';
