-- Mails waiting to go, and what became of them (2026-10-18).
--
-- Spec: docs/superpowers/specs/2026-10-18-visit-and-booking-mails-design.md
-- Immutable from first write: a correction is a later Flyway version.
--
-- A module queues a mail inside its own transaction, so a change that rolls
-- back queues nothing. The dedupe key says which telling it is ("the visit
-- VIS-12 was moved to Sun 5 Oct 4 pm"): a retried event or a second sweep
-- finds the key taken and queues nothing. A job sends what is due.
--
-- The address is not kept here. It is read when the mail goes, and only a
-- verified one is used, so a person who removed their email gets nothing.

CREATE SCHEMA IF NOT EXISTS mail;

CREATE TABLE mail.outbox (
    id UUID PRIMARY KEY,
    dedupe_key VARCHAR(200) NOT NULL,
    user_id UUID NOT NULL,
    -- What it is, for the log and for counting: VISIT_SCHEDULED, BOOKING_CONFIRMED, ...
    kind VARCHAR(40) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    html TEXT NOT NULL,
    text_body TEXT NOT NULL,
    -- PENDING, SENT, SKIPPED (no verified email when it was due), EXPIRED
    -- (still unsent a day after it was due), FAILED (gave up after retries).
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    -- Not before this: a mail held for the morning, or one waiting to retry.
    send_after TIMESTAMPTZ NOT NULL,
    -- When it was first due, so a retry does not keep it alive forever.
    due_at TIMESTAMPTZ NOT NULL,
    attempts SMALLINT NOT NULL DEFAULT 0,
    last_error VARCHAR(500),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_mail_outbox_dedupe UNIQUE (dedupe_key),
    CONSTRAINT ck_mail_outbox_status CHECK (status IN ('PENDING', 'SENT', 'SKIPPED', 'EXPIRED', 'FAILED'))
);

-- The sender's one read: what is pending and due.
CREATE INDEX ix_mail_outbox_due ON mail.outbox (send_after) WHERE status = 'PENDING';
