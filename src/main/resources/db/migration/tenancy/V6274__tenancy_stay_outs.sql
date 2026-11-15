-- Declared stay outs (user, 2026-11-08): a tenant says which nights they will
-- be away, and from which meal to which meal. Food leaves them out of the
-- forecast and the meal roster for those meals, and management sees who is
-- away tonight. PG and hostel stays, monthly ones only (checked in the app).
--
-- No last meal here = gone before the leaving day's first meal. No first meal
-- back = back after the return day's last meal. Cancelled ones are kept.

CREATE TABLE tenancy.stay_outs (
    id               uuid         PRIMARY KEY,
    tenancy_id       uuid         NOT NULL REFERENCES tenancy.tenancies(id) ON DELETE CASCADE,
    property_id      uuid         NOT NULL,
    tenant_user_id   uuid         NOT NULL,
    leave_date       date         NOT NULL,
    last_meal_here   varchar(20),
    return_date      date         NOT NULL,
    first_meal_back  varchar(20),
    reason           varchar(20),
    cancelled_at     timestamptz,
    created_at       timestamptz  NOT NULL,
    updated_at       timestamptz  NOT NULL,
    version          bigint       NOT NULL DEFAULT 0,
    CONSTRAINT chk_stay_outs_nights CHECK (return_date > leave_date AND return_date - leave_date <= 60),
    CONSTRAINT chk_stay_outs_last_meal CHECK (
        last_meal_here IS NULL OR last_meal_here IN ('BREAKFAST', 'LUNCH', 'EVENING_SNACKS', 'DINNER')),
    CONSTRAINT chk_stay_outs_first_meal CHECK (
        first_meal_back IS NULL OR first_meal_back IN ('BREAKFAST', 'LUNCH', 'EVENING_SNACKS', 'DINNER')),
    CONSTRAINT chk_stay_outs_reason CHECK (
        reason IS NULL OR reason IN ('HOME_VISIT', 'TRAVEL', 'WORK', 'OTHER'))
);

-- Who is away on a date at a property: the forecast, the roster and the board.
CREATE INDEX idx_stay_outs_property_dates
    ON tenancy.stay_outs (property_id, leave_date, return_date)
    WHERE cancelled_at IS NULL;

-- A tenant's own list, and the overlap check.
CREATE INDEX idx_stay_outs_tenancy ON tenancy.stay_outs (tenancy_id, leave_date);
