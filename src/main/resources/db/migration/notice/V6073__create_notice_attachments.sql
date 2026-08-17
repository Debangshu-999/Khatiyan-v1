-- Files attached to a notice: photos of a notice board, a PDF of the new rules,
-- this week's menu.
--
-- Attached to the NOTICE row, not to a recurring template. A recurring notice
-- generates one notice row per day (V6069), and per-day attachments were the
-- reason that model was chosen — Monday's menu must not still be showing on
-- Tuesday. Each day's row therefore carries its own files, and they age out
-- with it.

CREATE TABLE notice.notice_attachments (
    id UUID NOT NULL,
    notice_id UUID NOT NULL,
    -- IMAGE or DOCUMENT. The two are shown differently: images get a slideshow,
    -- documents a file row, so the reader's intent is stored rather than
    -- re-derived from the content type on every render.
    kind VARCHAR(20) NOT NULL,
    url VARCHAR(600) NOT NULL,
    -- Cloudinary handle. Without it the asset cannot be deleted; the orphan
    -- sweep needs it.
    public_id VARCHAR(255),
    file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(120),
    size_bytes BIGINT,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_notice_attachments PRIMARY KEY (id),

    -- Deleting a notice takes its attachments with it. The stored files are
    -- reclaimed separately by the orphan sweep, which is why public_id is kept.
    CONSTRAINT fk_notice_attachments_notice
        FOREIGN KEY (notice_id)
        REFERENCES notice.notices (id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_notice_attachments_notice_sort
    ON notice.notice_attachments (notice_id, sort_order);

CREATE INDEX idx_notice_attachments_notice
    ON notice.notice_attachments (notice_id);
