-- Property visits (2026-09-30): the slots in which tenants can book a visit.
--
-- One settings row per property holds how many visitors a slot takes and the
-- version every save is checked against, so two people editing the slots at
-- once can never both win. Its slots are rows under it, one per day and start
-- time. A day with no rows takes no visits.
--
-- Times are MINUTES OF THE DAY (10:30 is 630), not TIME columns. The app writes
-- TIME through hibernate.jdbc.time_zone=UTC, which shifts every value by the
-- JVM's offset (a 7:30 breakfast is stored as 02:00), so rules checked here
-- would judge the shifted clock: a 5:00-6:00 AM slot would land as 23:30-00:30
-- and be refused as ending before it starts. Integers carry no time zone.
--
-- The database also holds the rules a race could break: a slot ends after it
-- starts, on the same day, and two slots on one day never overlap. btree_gist
-- is already installed (V6175), which the overlap check needs.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE property.property_visit_settings (
    id                UUID PRIMARY KEY,
    property_id       UUID NOT NULL REFERENCES property.properties (id),
    visitors_per_slot INTEGER NOT NULL,
    version           BIGINT NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_property_visit_settings_property UNIQUE (property_id),
    CONSTRAINT chk_property_visit_settings_visitors CHECK (visitors_per_slot BETWEEN 1 AND 50)
);

CREATE TABLE property.property_visit_slots (
    settings_id      UUID NOT NULL REFERENCES property.property_visit_settings (id) ON DELETE CASCADE,
    day_of_week      VARCHAR(9) NOT NULL,
    start_minute     INTEGER NOT NULL,
    end_minute       INTEGER NOT NULL,
    CONSTRAINT pk_property_visit_slots PRIMARY KEY (settings_id, day_of_week, start_minute),
    CONSTRAINT chk_property_visit_slots_day CHECK (
        day_of_week IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY')),
    CONSTRAINT chk_property_visit_slots_minutes CHECK (
        start_minute BETWEEN 0 AND 1439 AND end_minute BETWEEN 0 AND 1439 AND end_minute > start_minute),
    CONSTRAINT ex_property_visit_slots_no_overlap EXCLUDE USING gist (
        settings_id WITH =,
        day_of_week WITH =,
        int4range(start_minute, end_minute) WITH &&
    )
);
