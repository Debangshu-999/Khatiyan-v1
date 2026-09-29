-- Owner analytics, spec §6.4 (docs/superpowers/specs/2026-09-26-analytics-dashboard-design.md).
--
-- One row per property per IST day, written just after midnight by
-- PropertyDailySnapshotJob and recording the END state of the day that just
-- finished. It exists for history no other module keeps: bed counts, dues and
-- deposits are only ever stored as their current value.
--
-- A missed night stays missing. Nothing here is estimated or backfilled.
-- Not a JPA entity, so ddl-auto: validate never inspects it.
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.property_daily_snapshot (
    property_id            UUID        NOT NULL,
    snapshot_date          DATE        NOT NULL,
    total_beds             INT         NOT NULL,
    occupied_beds          INT         NOT NULL,
    reserved_beds          INT         NOT NULL,
    unavailable_beds       INT         NOT NULL,
    active_monthly_stays   INT         NOT NULL,
    active_daily_stays     INT         NOT NULL,
    dues_outstanding_paise BIGINT      NOT NULL,
    dues_overdue_paise     BIGINT      NOT NULL,
    deposits_held_paise    BIGINT      NOT NULL,
    captured_at            TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (property_id, snapshot_date)
);
