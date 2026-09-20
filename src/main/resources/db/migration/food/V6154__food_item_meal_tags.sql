-- Which meals a dish belongs to.
--
-- Without this, adding an item to Monday's breakfast offered the property's
-- entire catalogue — chicken curry included. The tag is what lets the picker
-- show a breakfast list for breakfast.
--
-- A SET, not one meal: roti is dinner and breakfast, tea is breakfast and
-- snacks. Forcing one tag per item would mean duplicating the same dish under
-- two names, and the forecast would then cook it as two separate things.
CREATE TABLE food.food_item_meal_tags (
    item_id UUID NOT NULL REFERENCES food.food_items (id) ON DELETE CASCADE,
    meal_type VARCHAR(20) NOT NULL,
    PRIMARY KEY (item_id, meal_type)
);

CREATE INDEX idx_food_item_meal_tags_lookup
    ON food.food_item_meal_tags (meal_type, item_id);

-- Every item that already exists is tagged for every meal.
--
-- An untagged item would match no meal and vanish from every picker the moment
-- this ships, so a property's whole catalogue would look deleted. Tagged for
-- all four, nothing changes until an owner narrows an item down themselves.
INSERT INTO food.food_item_meal_tags (item_id, meal_type)
SELECT id, meal
FROM food.food_items
CROSS JOIN (VALUES ('BREAKFAST'), ('LUNCH'), ('DINNER'), ('EVENING_SNACKS')) AS meals (meal);
