-- An item the kitchen is not cooking on ONE date.
--
-- The weekly menu is a repeating pattern, not a calendar. When the fish does
-- not arrive on Thursday, the owner needs Thursday's forecast to drop it
-- without editing the menu that every other Thursday depends on — and without
-- having to remember to put it back.
--
-- Keyed by date, meal and item across the whole property rather than per
-- profile: the forecast lists items consolidated, so "not cooking fish today"
-- is one decision about one pot, not one per diet that happens to include it.
CREATE TABLE food.food_daily_skips (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    item_id UUID NOT NULL REFERENCES food.food_items (id),
    skip_date DATE NOT NULL,
    meal_type VARCHAR(20) NOT NULL,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

-- Marking the same item unavailable twice is the same fact, not two of them.
CREATE UNIQUE INDEX uq_food_daily_skips_slot
    ON food.food_daily_skips (property_id, skip_date, meal_type, item_id);

-- Every forecast reads this by property and date.
CREATE INDEX idx_food_daily_skips_lookup
    ON food.food_daily_skips (property_id, skip_date, meal_type);
