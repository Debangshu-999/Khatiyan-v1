-- Search along metro. Lines, order and stations come from a reviewed file per city in
-- docs/metro-data, so a new city is one seed migration. Nothing here is per property.
CREATE TABLE discovery.metro_systems (
    code             VARCHAR(40) PRIMARY KEY,
    name             VARCHAR(80) NOT NULL,
    centre_latitude  NUMERIC(10, 7) NOT NULL,
    centre_longitude NUMERIC(10, 7) NOT NULL
);

CREATE TABLE discovery.metro_lines (
    code          VARCHAR(40) PRIMARY KEY,
    system_code   VARCHAR(40) NOT NULL REFERENCES discovery.metro_systems (code),
    name          VARCHAR(80) NOT NULL,
    colour        VARCHAR(7)  NOT NULL,
    display_order INTEGER     NOT NULL,
    UNIQUE (system_code, display_order)
);

CREATE TABLE discovery.metro_stations (
    code        VARCHAR(60) PRIMARY KEY,
    system_code VARCHAR(40)    NOT NULL REFERENCES discovery.metro_systems (code),
    name        VARCHAR(80)    NOT NULL,
    latitude    NUMERIC(10, 7) NOT NULL,
    longitude   NUMERIC(10, 7) NOT NULL
);

-- One row per line a station is on. A station with two rows is an interchange: one station
-- to tick and one coordinate to measure from, mapped onto each of its lines here.
CREATE TABLE discovery.metro_line_stations (
    line_code    VARCHAR(40) NOT NULL REFERENCES discovery.metro_lines (code),
    position     INTEGER     NOT NULL,
    station_code VARCHAR(60) NOT NULL REFERENCES discovery.metro_stations (code),
    PRIMARY KEY (line_code, position),
    UNIQUE (line_code, station_code)
);

CREATE INDEX idx_metro_line_stations_station ON discovery.metro_line_stations (station_code);
