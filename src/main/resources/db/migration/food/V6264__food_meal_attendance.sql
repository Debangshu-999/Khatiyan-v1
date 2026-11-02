-- Meal attendance (user, 2026-11-01).
--
-- The switch lives with the rest of the food settings. attendance_enabled_at is
-- when it was last turned on, so a meal already under way then is left alone
-- and recording starts from the next one.
--
-- One row per tenant per meal per day: the meal's roster, written once the meal
-- has started and a pass or the scanner first asks for it. It holds that
-- tenant's pass, and attended_at is set by the scan. A row with no attended_at
-- is a skip only if the meal has at least one scan: a meal nobody scanned was
-- not recorded, it does not mean everybody skipped.

ALTER TABLE food.food_module_settings
    ADD COLUMN attendance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN attendance_enabled_at TIMESTAMPTZ;

CREATE TABLE food.food_meal_attendance (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    meal_date DATE NOT NULL,
    meal_type VARCHAR(20) NOT NULL,
    tenancy_id UUID NOT NULL,
    tenant_user_id UUID NOT NULL,
    profile_id UUID NOT NULL,
    pass_token VARCHAR(64) NOT NULL,
    pass_code VARCHAR(6) NOT NULL,
    attended_at TIMESTAMPTZ,
    recorded_by_user_id UUID,
    record_method VARCHAR(10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_food_meal_attendance_recorded CHECK (
        (attended_at IS NULL AND recorded_by_user_id IS NULL AND record_method IS NULL)
        OR (attended_at IS NOT NULL AND recorded_by_user_id IS NOT NULL AND record_method IS NOT NULL))
);

CREATE UNIQUE INDEX uq_food_meal_attendance_tenancy
    ON food.food_meal_attendance (property_id, meal_date, meal_type, tenancy_id);
CREATE UNIQUE INDEX uq_food_meal_attendance_code
    ON food.food_meal_attendance (property_id, meal_date, meal_type, pass_code);
CREATE UNIQUE INDEX uq_food_meal_attendance_token
    ON food.food_meal_attendance (pass_token);
