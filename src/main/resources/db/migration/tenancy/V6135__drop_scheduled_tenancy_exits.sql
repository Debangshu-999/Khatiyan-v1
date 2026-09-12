-- Scheduled exits were removed on 2026-09-12. They added a layer the end
-- process did not need: a person ends every stay from the end-tenancy screen.
-- V6131 to V6133 stay in place because they may already have run.

DROP TABLE IF EXISTS tenancy.scheduled_tenancy_exits;
DROP TABLE IF EXISTS tenancy.property_exit_schedule_settings;

-- The removed events can no longer be read back, so an outstanding publication
-- of either would fail again on every restart.
DELETE FROM public.event_publication
WHERE event_type IN (
    'com.khatiyan.d_modules.tenancy.event.ScheduledTenancyExitFailedEvent',
    'com.khatiyan.d_modules.tenancy.event.ScheduledExitBillRaisedEvent');
