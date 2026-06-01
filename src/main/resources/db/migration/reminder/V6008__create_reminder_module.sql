CREATE SCHEMA IF NOT EXISTS reminder;

CREATE TABLE reminder.reminder_records (
    id UUID PRIMARY KEY,
    reminder_key VARCHAR(220) NOT NULL,
    reminder_type VARCHAR(80) NOT NULL,
    source_type VARCHAR(80) NOT NULL,
    source_id UUID NOT NULL,
    recipient_user_id UUID NOT NULL,
    property_id UUID,
    tenancy_id UUID,
    scheduled_for_date DATE NOT NULL,
    title VARCHAR(160) NOT NULL,
    body VARCHAR(1000) NOT NULL,
    notification_category VARCHAR(80) NOT NULL,
    notification_priority VARCHAR(40) NOT NULL,
    delivery_mode VARCHAR(40) NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(40) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,

    CONSTRAINT uk_reminder_records_key UNIQUE (reminder_key)
);

CREATE INDEX idx_reminder_records_due
    ON reminder.reminder_records (status, scheduled_for_date);

CREATE INDEX idx_reminder_records_recipient
    ON reminder.reminder_records (recipient_user_id, created_at DESC);

CREATE INDEX idx_reminder_records_property
    ON reminder.reminder_records (property_id, created_at DESC);

CREATE INDEX idx_reminder_records_tenancy
    ON reminder.reminder_records (tenancy_id, created_at DESC);
