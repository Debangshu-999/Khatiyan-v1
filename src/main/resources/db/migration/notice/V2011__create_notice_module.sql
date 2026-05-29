CREATE SCHEMA IF NOT EXISTS notice;

CREATE TABLE notice.property_board_categories (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    created_by_user_id UUID NOT NULL,

    name VARCHAR(80) NOT NULL,
    slug VARCHAR(80) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_property_board_categories_property_slug
        UNIQUE (property_id, slug)
);

CREATE TABLE notice.property_board_items (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    created_by_user_id UUID NOT NULL,

    category_id UUID NOT NULL,
    title VARCHAR(120) NOT NULL,
    body VARCHAR(1000) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_property_board_items_category
        FOREIGN KEY (category_id)
        REFERENCES notice.property_board_categories (id)
);

CREATE TABLE notice.notices (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    created_by_user_id UUID NOT NULL,

    title VARCHAR(160) NOT NULL,
    body VARCHAR(2000) NOT NULL,
    priority VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,

    visible_from TIMESTAMPTZ NOT NULL,
    visible_until TIMESTAMPTZ,
    published_at TIMESTAMPTZ NOT NULL,
    archived_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_notice_visibility_window
        CHECK (visible_until IS NULL OR visible_until >= visible_from)
);

CREATE INDEX idx_property_board_categories_property_active
    ON notice.property_board_categories (property_id, is_active, display_order);

CREATE INDEX idx_property_board_items_property_active
    ON notice.property_board_items (property_id, is_active, display_order);

CREATE INDEX idx_property_board_items_property_category
    ON notice.property_board_items (property_id, category_id)
    WHERE is_active = TRUE;

CREATE INDEX idx_notices_property_status
    ON notice.notices (property_id, status, published_at DESC);

CREATE INDEX idx_notices_property_visible_window
    ON notice.notices (property_id, status, visible_from, visible_until);

CREATE INDEX idx_notices_expired_published
    ON notice.notices (visible_until)
    WHERE status = 'PUBLISHED' AND visible_until IS NOT NULL;
