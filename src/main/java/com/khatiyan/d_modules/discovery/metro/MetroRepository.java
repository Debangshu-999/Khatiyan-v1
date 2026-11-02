package com.khatiyan.d_modules.discovery.metro;

import java.util.Collection;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/** The seeded metro tables. They change only by migration, so this only reads. */
@Repository
public class MetroRepository {

    public record SystemRow(String code, String name, double centreLatitude, double centreLongitude) {
    }

    public record LineRow(String code, String systemCode, String name, String colour) {
    }

    public record LineStationRow(String lineCode, String stationCode, String stationName) {
    }

    private final NamedParameterJdbcTemplate jdbc;

    public MetroRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<SystemRow> systems() {
        return jdbc.query("""
                SELECT code, name, centre_latitude, centre_longitude
                FROM discovery.metro_systems
                ORDER BY name
                """, (rs, row) -> new SystemRow(
                rs.getString("code"),
                rs.getString("name"),
                rs.getDouble("centre_latitude"),
                rs.getDouble("centre_longitude")));
    }

    public List<LineRow> lines() {
        return jdbc.query("""
                SELECT code, system_code, name, colour
                FROM discovery.metro_lines
                ORDER BY system_code, display_order
                """, (rs, row) -> new LineRow(
                rs.getString("code"),
                rs.getString("system_code"),
                rs.getString("name"),
                rs.getString("colour")));
    }

    public List<LineStationRow> lineStations() {
        return jdbc.query("""
                SELECT ls.line_code, ls.station_code, s.name
                FROM discovery.metro_line_stations ls
                JOIN discovery.metro_stations s ON s.code = ls.station_code
                ORDER BY ls.line_code, ls.position
                """, (rs, row) -> new LineStationRow(
                rs.getString("line_code"),
                rs.getString("station_code"),
                rs.getString("name")));
    }

    public List<MetroProximity.StationPoint> stationPoints(Collection<String> codes) {
        return jdbc.query("""
                SELECT name, latitude, longitude
                FROM discovery.metro_stations
                WHERE code IN (:codes)
                """, Map.of("codes", codes), (rs, row) -> new MetroProximity.StationPoint(
                rs.getString("name"),
                rs.getDouble("latitude"),
                rs.getDouble("longitude")));
    }
}
