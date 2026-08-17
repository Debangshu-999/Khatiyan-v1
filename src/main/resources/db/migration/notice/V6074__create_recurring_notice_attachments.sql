-- Files held by a recurring notice TEMPLATE, copied onto every day it generates.
--
-- Separate from notice.notice_attachments on purpose, mirroring the split
-- between notices and recurring_notices that this module already has. A
-- template's files are a rule ("always show this supply-outage notice with this
-- photo"); a notice's files are that day's content.
--
-- Copied, not shared. The generator duplicates these rows into
-- notice.notice_attachments for each day's notice, so an owner can add today's
-- menu to today's notice, or remove a file from one day, without touching the
-- template or any other day. It also means editing the template changes only
-- days generated afterwards — yesterday's notice does not rewrite itself.

CREATE TABLE notice.recurring_notice_attachments (
    id UUID NOT NULL,
    recurring_notice_id UUID NOT NULL,
    kind VARCHAR(20) NOT NULL,
    url VARCHAR(600) NOT NULL,
    public_id VARCHAR(255),
    file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(120),
    size_bytes BIGINT,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_recurring_notice_attachments PRIMARY KEY (id),

    CONSTRAINT fk_recurring_notice_attachments_template
        FOREIGN KEY (recurring_notice_id)
        REFERENCES notice.recurring_notices (id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_recurring_notice_attachments_sort
    ON notice.recurring_notice_attachments (recurring_notice_id, sort_order);

CREATE INDEX idx_recurring_notice_attachments_template
    ON notice.recurring_notice_attachments (recurring_notice_id);
