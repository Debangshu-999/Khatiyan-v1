-- Per-recipient audience so accounts with multiple roles (e.g. tenant + manager)
-- see a separated feed: tenant notifications in the tenant workspace, management
-- notifications in the owner/manager workspace. NULL means "show in either"
-- (account-level/security notifications and legacy rows created before this).
ALTER TABLE notification.notification_recipients
    ADD COLUMN audience VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_notification_recipients_user_audience
    ON notification.notification_recipients (user_id, audience);
