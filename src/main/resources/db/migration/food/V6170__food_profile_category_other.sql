-- An "Other" category for profiles that are none of the five diets
-- (2026-09-28). With it every profile has a category, so the few the V6169
-- backfill could not place become Other and the column is required.

ALTER TABLE food.food_profiles DROP CONSTRAINT ck_food_profiles_category;

UPDATE food.food_profiles SET category = 'OTHER' WHERE category IS NULL;

ALTER TABLE food.food_profiles ALTER COLUMN category SET NOT NULL;

ALTER TABLE food.food_profiles ADD CONSTRAINT ck_food_profiles_category
    CHECK (category IN ('VEG', 'NON_VEG', 'JAIN', 'PESCATARIAN', 'EGGETARIAN', 'OTHER'));
