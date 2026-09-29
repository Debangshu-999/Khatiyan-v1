-- Food plans become dated versions with a profile for each weekday (2026-09-29).
--
-- A row is one version of a tenancy's plan: it applies from effective_from
-- up to, not including, effective_until (IST dates; open when null). A change
-- takes effect after the next midnight by writing a version that starts
-- tomorrow, so no job has to run at midnight. The week lives in
-- food_subscription_days: a normal plan repeats one profile, a hybrid plan
-- mixes them.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE food.food_subscriptions
    ADD COLUMN effective_from DATE,
    ADD COLUMN effective_until DATE;

-- Until now a plan started and ended at once, so the dates are the IST days
-- of those moments.
UPDATE food.food_subscriptions
SET effective_from = (started_at AT TIME ZONE 'Asia/Kolkata')::date,
    effective_until = CASE
        WHEN is_active THEN NULL
        ELSE (ended_at AT TIME ZONE 'Asia/Kolkata')::date
    END;

ALTER TABLE food.food_subscriptions
    ALTER COLUMN effective_from SET NOT NULL,
    ADD CONSTRAINT chk_food_subscriptions_dates
        CHECK (effective_until IS NULL OR effective_until >= effective_from);

CREATE TABLE food.food_subscription_days (
    subscription_id UUID NOT NULL,
    day_of_week VARCHAR(16) NOT NULL,
    profile_id UUID NOT NULL,

    CONSTRAINT pk_food_subscription_days PRIMARY KEY (subscription_id, day_of_week),
    CONSTRAINT fk_food_subscription_days_subscription
        FOREIGN KEY (subscription_id) REFERENCES food.food_subscriptions (id) ON DELETE CASCADE,
    CONSTRAINT fk_food_subscription_days_profile
        FOREIGN KEY (profile_id) REFERENCES food.food_profiles (id),
    CONSTRAINT chk_food_subscription_days_day
        CHECK (day_of_week IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'))
);

CREATE INDEX idx_food_subscription_days_profile
    ON food.food_subscription_days (profile_id);

-- Every existing plan is a normal one: its profile on all seven days.
INSERT INTO food.food_subscription_days (subscription_id, day_of_week, profile_id)
SELECT s.id, d.day_of_week, s.profile_id
FROM food.food_subscriptions s
CROSS JOIN (VALUES ('MONDAY'), ('TUESDAY'), ('WEDNESDAY'), ('THURSDAY'),
                   ('FRIDAY'), ('SATURDAY'), ('SUNDAY')) AS d (day_of_week);

-- The single-profile, active-flag model goes.
DROP INDEX food.uq_food_subscriptions_active_tenancy;
DROP INDEX food.uq_food_subscriptions_active_tenant;
DROP INDEX food.idx_food_subscriptions_profile_active;
DROP INDEX food.idx_food_subscriptions_property_active;
ALTER TABLE food.food_subscriptions
    DROP CONSTRAINT chk_food_subscriptions_end,
    DROP CONSTRAINT fk_food_subscriptions_profile,
    DROP COLUMN profile_id,
    DROP COLUMN is_active;

-- One open version per tenancy, and never two versions on the same day.
CREATE UNIQUE INDEX uq_food_subscriptions_open_tenancy
    ON food.food_subscriptions (tenancy_id)
    WHERE effective_until IS NULL;

ALTER TABLE food.food_subscriptions
    ADD CONSTRAINT ex_food_subscriptions_no_overlap
        EXCLUDE USING gist (tenancy_id WITH =, daterange(effective_from, effective_until, '[)') WITH &&);

CREATE INDEX idx_food_subscriptions_property_dates
    ON food.food_subscriptions (property_id, effective_from, effective_until);
