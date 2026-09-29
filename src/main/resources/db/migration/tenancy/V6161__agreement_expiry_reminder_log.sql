-- Which agreement-expiry milestones each fixed-term stay has been sent.
--
-- The reminders used to fire only on the exact day of a milestone at 00:05, so
-- a night the server was down lost that milestone for good: no expiry reminder
-- had ever gone out in dev. Now each run sends the milestone due NOW if this
-- log does not have it yet, so a missed night is caught by the next run, once,
-- and a rerun sends nothing. The row is the proof it was sent.
CREATE TABLE tenancy.agreement_expiry_reminder_log (
    tenancy_id  UUID        NOT NULL,
    days_before INTEGER     NOT NULL,
    sent_on     DATE        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenancy_id, days_before),
    CONSTRAINT chk_agreement_expiry_reminder_days CHECK (days_before >= 0)
);
