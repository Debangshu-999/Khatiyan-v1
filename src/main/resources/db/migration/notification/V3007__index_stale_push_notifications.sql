CREATE INDEX idx_push_notifications_stale_in_progress
    ON notification.push_notifications (locked_at, created_at)
    WHERE status = 'IN_PROGRESS';
