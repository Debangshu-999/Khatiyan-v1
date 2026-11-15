-- Each move-in item's condition, Working, Damaged or Broken (user, 2026-11-07).
-- Null on items recorded before, which read their old level instead.
ALTER TABLE tenancy.move_in_checklist_items
    ADD COLUMN item_condition VARCHAR(10);
