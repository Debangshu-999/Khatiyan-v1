-- Carry the notification audience through the reminder pipeline so scheduled
-- reminders land in the correct workspace (tenant vs management) for accounts
-- with multiple roles. NULL = show in either (legacy rows).
ALTER TABLE reminder.reminder_records
    ADD COLUMN audience VARCHAR(20);
