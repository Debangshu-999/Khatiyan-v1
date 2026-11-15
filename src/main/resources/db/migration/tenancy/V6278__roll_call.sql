-- Nightly roll call (user, 2026-11-15, P1.10.b). Spec:
-- docs/superpowers/specs/2026-11-15-roll-call-design.md.
--
-- Per property: off by default, a window the owner sets (minutes of the day,
-- INTEGER, never TIME), automatic check-in off by default, a 100 m radius. The
-- property's WiFi routers by BSSID. One mark per stay per night; a stay with no
-- mark is Not marked, never Absent on its own.

CREATE TABLE IF NOT EXISTS tenancy.roll_call_settings (
    property_id UUID PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    auto_check_in BOOLEAN NOT NULL DEFAULT FALSE,
    window_start_minute INTEGER,
    window_end_minute INTEGER,
    radius_meters INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT roll_call_window_start_in_day CHECK (window_start_minute IS NULL OR window_start_minute BETWEEN 0 AND 1439),
    CONSTRAINT roll_call_window_end_in_day CHECK (window_end_minute IS NULL OR window_end_minute BETWEEN 0 AND 1439)
);

CREATE TABLE IF NOT EXISTS tenancy.roll_call_wifi (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    bssid VARCHAR(17) NOT NULL,
    ssid VARCHAR(64),
    added_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_roll_call_wifi_property_bssid
    ON tenancy.roll_call_wifi (property_id, bssid);

CREATE TABLE IF NOT EXISTS tenancy.roll_call_marks (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    tenancy_id UUID NOT NULL,
    night DATE NOT NULL,
    status VARCHAR(20) NOT NULL,
    method VARCHAR(20) NOT NULL,
    marked_at TIMESTAMPTZ NOT NULL,
    marked_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_roll_call_marks_tenancy_night
    ON tenancy.roll_call_marks (tenancy_id, night);

CREATE INDEX IF NOT EXISTS idx_roll_call_marks_property_night
    ON tenancy.roll_call_marks (property_id, night);
