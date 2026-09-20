CREATE SCHEMA IF NOT EXISTS food;

CREATE TABLE food.food_items (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    created_by_user_id UUID NOT NULL,

    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    image_url VARCHAR(600),
    image_public_id VARCHAR(255),
    quantity_unit VARCHAR(30) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX uq_food_items_property_name_active
    ON food.food_items (property_id, LOWER(name))
    WHERE is_active = TRUE;

CREATE INDEX idx_food_items_property_active
    ON food.food_items (property_id, is_active, name);

CREATE TABLE food.food_profiles (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    created_by_user_id UUID NOT NULL,

    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_food_profiles_display_order
        CHECK (display_order >= 0)
);

CREATE UNIQUE INDEX uq_food_profiles_property_name_active
    ON food.food_profiles (property_id, LOWER(name))
    WHERE is_active = TRUE;

CREATE INDEX idx_food_profiles_property_active
    ON food.food_profiles (property_id, is_active, display_order, name);

CREATE TABLE food.food_menu_entries (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    profile_id UUID NOT NULL,
    item_id UUID NOT NULL,
    created_by_user_id UUID NOT NULL,

    day_of_week VARCHAR(12) NOT NULL,
    meal_type VARCHAR(20) NOT NULL,
    base_quantity_per_subscriber NUMERIC(12, 3) NOT NULL,
    repeat_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0,
    expected_repeat_percentage INTEGER NOT NULL DEFAULT 0,
    fixed_buffer_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0,
    batch_size NUMERIC(12, 3),
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_food_menu_entries_profile
        FOREIGN KEY (profile_id) REFERENCES food.food_profiles (id),
    CONSTRAINT fk_food_menu_entries_item
        FOREIGN KEY (item_id) REFERENCES food.food_items (id),
    CONSTRAINT chk_food_menu_entries_base_quantity
        CHECK (base_quantity_per_subscriber > 0),
    CONSTRAINT chk_food_menu_entries_repeat_quantity
        CHECK (repeat_quantity >= 0),
    CONSTRAINT chk_food_menu_entries_repeat_percentage
        CHECK (expected_repeat_percentage BETWEEN 0 AND 100),
    CONSTRAINT chk_food_menu_entries_buffer
        CHECK (fixed_buffer_quantity >= 0),
    CONSTRAINT chk_food_menu_entries_batch_size
        CHECK (batch_size IS NULL OR batch_size > 0),
    CONSTRAINT chk_food_menu_entries_display_order
        CHECK (display_order >= 0)
);

CREATE UNIQUE INDEX uq_food_menu_entries_active_slot_item
    ON food.food_menu_entries (profile_id, day_of_week, meal_type, item_id)
    WHERE is_active = TRUE;

CREATE INDEX idx_food_menu_entries_profile_slot
    ON food.food_menu_entries (profile_id, day_of_week, meal_type, is_active, display_order);

CREATE INDEX idx_food_menu_entries_property_slot
    ON food.food_menu_entries (property_id, day_of_week, meal_type)
    WHERE is_active = TRUE;

CREATE TABLE food.food_subscriptions (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    tenancy_id UUID NOT NULL,
    tenant_user_id UUID NOT NULL,
    profile_id UUID NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    end_reason VARCHAR(120),

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_food_subscriptions_profile
        FOREIGN KEY (profile_id) REFERENCES food.food_profiles (id),
    CONSTRAINT chk_food_subscriptions_end
        CHECK ((is_active = TRUE AND ended_at IS NULL)
            OR (is_active = FALSE AND ended_at IS NOT NULL))
);

CREATE UNIQUE INDEX uq_food_subscriptions_active_tenancy
    ON food.food_subscriptions (tenancy_id)
    WHERE is_active = TRUE;

CREATE UNIQUE INDEX uq_food_subscriptions_active_tenant
    ON food.food_subscriptions (tenant_user_id)
    WHERE is_active = TRUE;

CREATE INDEX idx_food_subscriptions_profile_active
    ON food.food_subscriptions (profile_id, is_active);

CREATE INDEX idx_food_subscriptions_property_active
    ON food.food_subscriptions (property_id, is_active);
