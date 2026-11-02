-- What kind of dish an item is, which the ratings screen groups by (user, 2026-11-02).
-- A first guess from the name for the dishes already there, in the order and with the
-- words of FoodDishType.guess. The owner can change it on the dish.

ALTER TABLE food.food_items ADD COLUMN dish_type VARCHAR(20) NOT NULL DEFAULT 'VEG';

UPDATE food.food_items SET dish_type = CASE
    WHEN name ~* '\y(tea|coffee|chai|juice|milk|lassi|buttermilk|chaas|shake|milkshake|water|soda|lemonade|sharbat|smoothie)\y' THEN 'DRINK'
    WHEN name ~* '\y(chicken|mutton|fish|egg|eggs|prawn|prawns|meat|keema|omelette|omelet|beef|pork|lamb)\y' THEN 'NON_VEG'
    WHEN name ~* '\y(rice|roti|chapati|phulka|naan|puri|bread|dal|raita|curd|dahi|salad|papad|pickle|achar|chutney)\y' THEN 'COMMON'
    ELSE 'VEG'
END;
