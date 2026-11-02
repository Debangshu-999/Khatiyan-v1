-- Meal ratings and the weekly AI reading of them (user, 2026-11-01).
--
-- One row per dish a tenant rated at one meal. profile_id is the plan they were on
-- that day, so a later plan change does not rewrite history. tenancy_id and user_id
-- are for the rules on who may rate and for nothing an owner ever sees: owners get
-- averages only, and review is read by the AI and by no screen.

CREATE TABLE food.food_meal_ratings (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    meal_date DATE NOT NULL,
    meal_type VARCHAR(20) NOT NULL,
    tenancy_id UUID NOT NULL,
    user_id UUID NOT NULL,
    profile_id UUID NOT NULL,
    item_id UUID NOT NULL,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review VARCHAR(300),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_food_meal_rating UNIQUE (property_id, meal_date, meal_type, tenancy_id, item_id)
);

CREATE INDEX idx_food_meal_ratings_property_date ON food.food_meal_ratings (property_id, meal_date);

-- One a week per property. A row whose expires_on has passed is read by no screen.
CREATE TABLE food.food_meal_review_analyses (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    generated_on DATE NOT NULL,
    expires_on DATE NOT NULL,
    generated_by_user_id UUID NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_food_meal_review_analysis UNIQUE (property_id, generated_on)
);

CREATE INDEX idx_food_meal_review_analyses_current ON food.food_meal_review_analyses (property_id, expires_on DESC);
