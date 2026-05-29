ALTER TABLE notification.notifications
DROP COLUMN IF EXISTS source_type;

UPDATE notification.push_notifications
SET status = 'IN_PROGRESS'
WHERE status = 'PROCESSING';