ALTER TABLE notice.recurring_notices
ADD COLUMN last_processed_for_date DATE;

CREATE INDEX idx_recurring_notices_active_processing_due
    ON notice.recurring_notices (
        active_from,
        active_until,
        last_processed_for_date,
        created_at
    )
    WHERE status = 'ACTIVE';
