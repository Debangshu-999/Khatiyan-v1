-- Meal schedule (2026-09-28): a category on every food profile, one meal
-- timetable per property, and one-day meal delays.

-- A profile's diet, picked from a fixed list rather than read out of its name.
-- NULL only on rows the backfill below could not place: the owner picks one on
-- the next edit, which requires it.
ALTER TABLE food.food_profiles ADD COLUMN category VARCHAR(20);
ALTER TABLE food.food_profiles ADD CONSTRAINT ck_food_profiles_category
    CHECK (category IS NULL OR category IN ('VEG', 'NON_VEG', 'JAIN', 'PESCATARIAN', 'EGGETARIAN'));

-- The same guess the app's profile icon made from the name. Order matters:
-- "non veg" contains "veg", so the specific words are tried first.
UPDATE food.food_profiles SET category = CASE
    WHEN lower(name) LIKE '%jain%' THEN 'JAIN'
    WHEN lower(name) LIKE '%pesc%' OR lower(name) LIKE '%fish%' THEN 'PESCATARIAN'
    WHEN lower(name) LIKE '%egg%' THEN 'EGGETARIAN'
    WHEN lower(name) LIKE '%non-veg%' OR lower(name) LIKE '%non veg%' OR lower(name) LIKE '%nonveg%'
        OR lower(name) LIKE '%chicken%' OR lower(name) LIKE '%meat%' OR lower(name) LIKE '%mutton%' THEN 'NON_VEG'
    WHEN lower(name) LIKE '%veg%' THEN 'VEG'
    ELSE NULL
END;

-- One start and end per meal per property, local time (IST). A property with no
-- row for a meal is on the default for it (MealScheduleRules.DEFAULTS), so
-- nothing is seeded here.
CREATE TABLE food.food_meal_timings (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    meal_type VARCHAR(20) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    updated_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_food_meal_timings_window CHECK (end_time > start_time)
);

CREATE UNIQUE INDEX uq_food_meal_timings_meal ON food.food_meal_timings (property_id, meal_type);

-- A meal pushed later on ONE date. The total delay from the planned start, so a
-- second delay replaces the first rather than stacking a row on it.
CREATE TABLE food.food_meal_delays (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    meal_date DATE NOT NULL,
    meal_type VARCHAR(20) NOT NULL,
    delay_minutes INT NOT NULL,
    delayed_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_food_meal_delays_positive CHECK (delay_minutes > 0)
);

CREATE UNIQUE INDEX uq_food_meal_delays_slot ON food.food_meal_delays (property_id, meal_date, meal_type);
