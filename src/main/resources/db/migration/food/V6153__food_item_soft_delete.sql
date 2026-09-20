-- A retired food item can now be removed from the owner's list without the row
-- leaving the database.
--
-- Three states, not two. `is_active = FALSE` is RETIRED: off the menus, still
-- listed, and the owner can bring it back. `deleted_at` is REMOVED: gone from
-- every list the app shows, and not recoverable from the UI.
--
-- The row survives a removal deliberately. `food_menu_entries.item_id` carries
-- a foreign key to this table, so a real DELETE would either be refused by the
-- database or take a property's menu history with it — and that history is what
-- past cooking forecasts were computed from.
ALTER TABLE food.food_items
    ADD COLUMN deleted_at TIMESTAMPTZ;

-- Only a retired item may be removed, so a removed row is never also active.
-- The name uniqueness index is already scoped to `is_active = TRUE`, so a
-- removal frees the name for reuse without any change to it.
ALTER TABLE food.food_items
    ADD CONSTRAINT chk_food_items_deleted_is_inactive
        CHECK (deleted_at IS NULL OR is_active = FALSE);

-- The owner's list reads live rows only.
CREATE INDEX idx_food_items_property_live
    ON food.food_items (property_id)
    WHERE deleted_at IS NULL;
