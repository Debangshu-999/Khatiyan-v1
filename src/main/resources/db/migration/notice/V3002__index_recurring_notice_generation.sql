CREATE INDEX idx_recurring_notices_active_generation_due
    ON notice.recurring_notices (
        active_from,
        active_until,
        last_generated_for_date,
        frequency,
        created_at
    )
    WHERE status = 'ACTIVE';
