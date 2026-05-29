CREATE SCHEMA IF NOT EXISTS notification;

CREATE TABLE notification.notifications (
    id UUID PRIMARY KEY,

    title VARCHAR(160) NOT NULL,
    body VARCHAR(2000) NOT NULL,
    category VARCHAR(30) NOT NULL,
    priority VARCHAR(20) NOT NULL,

    source_type VARCHAR(40),
    source_id UUID,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE notification.notification_recipients (
    id UUID PRIMARY KEY,
    notification_id UUID NOT NULL,
    user_id UUID NOT NULL,

    read_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_notification_recipients_notification
        FOREIGN KEY (notification_id)
        REFERENCES notification.notifications (id)
);

CREATE TABLE notification.push_notifications (
    id UUID PRIMARY KEY,
    notification_recipient_id UUID NOT NULL,
    user_id UUID NOT NULL,

    status VARCHAR(30) NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL,

    locked_at TIMESTAMPTZ,
    last_attempted_at TIMESTAMPTZ,
    last_attempt_provider VARCHAR(30),

    delivered_at TIMESTAMPTZ,
    delivered_provider VARCHAR(30),

    failure_reason VARCHAR(1000),

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_push_notifications_recipient
        FOREIGN KEY (notification_recipient_id)
        REFERENCES notification.notification_recipients (id)
);

CREATE TABLE notification.notification_device_tokens (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,

    provider VARCHAR(30) NOT NULL,
    provider_token VARCHAR(500) NOT NULL,
    platform VARCHAR(20) NOT NULL,

    active BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ NOT NULL,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_notification_device_provider_token
        UNIQUE (provider, provider_token)
);

CREATE INDEX idx_notifications_category_created
    ON notification.notifications (category, created_at DESC);

CREATE INDEX idx_notification_recipients_user_visible
    ON notification.notification_recipients (user_id, archived_at, created_at DESC);

CREATE INDEX idx_notification_recipients_user_unread
    ON notification.notification_recipients (user_id, read_at)
    WHERE archived_at IS NULL;

CREATE INDEX idx_push_notifications_pending
    ON notification.push_notifications (status, next_attempt_at, created_at)
    WHERE status = 'PENDING';

CREATE INDEX idx_push_notifications_user_status
    ON notification.push_notifications (user_id, status, created_at DESC);

CREATE INDEX idx_notification_device_tokens_user_active
    ON notification.notification_device_tokens (user_id, active, provider);
