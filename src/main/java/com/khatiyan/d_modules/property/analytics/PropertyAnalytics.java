package com.khatiyan.d_modules.property.analytics;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import com.khatiyan.c_shared.exception.NotFoundException;

/**
 * The property module's answers for owner analytics. Reads the {@code property}
 * schema only, and is the module's entry point for {@code d_modules/analytics}.
 */
@Component
public class PropertyAnalytics {

    private final NamedParameterJdbcTemplate jdbc;

    public PropertyAnalytics(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Empty beds in a room under maintenance cannot be let, so they are unavailable rather than vacant. */
    public record BedCounts(int totalBeds, int occupiedBeds, int reservedBeds, int unavailableBeds) {}

    /** The IST date the property joined Khatiyan: where "All time" starts. */
    public LocalDate registeredOn(UUID propertyId) {
        List<LocalDate> dates = jdbc.query("""
                SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS joined
                FROM property.properties WHERE id = :propertyId
                """, Map.of("propertyId", propertyId), (rs, i) -> rs.getObject("joined", LocalDate.class));
        if (dates.isEmpty()) {
            throw new NotFoundException("Property", propertyId);
        }
        return dates.get(0);
    }

    public List<UUID> activePropertyIds() {
        return jdbc.query("SELECT id FROM property.properties WHERE is_active = true ORDER BY id",
                Map.of(), (rs, i) -> rs.getObject("id", UUID.class));
    }

    /** Active rooms only: a deactivated room has been taken out of the property, so its beds are not beds. */
    public BedCounts bedCounts(UUID propertyId) {
        return jdbc.queryForObject("""
                SELECT COALESCE(SUM(capacity), 0) AS total,
                       COALESCE(SUM(COALESCE(occupied_count, 0)), 0) AS occupied,
                       COALESCE(SUM(COALESCE(reserved_count, 0)), 0) AS reserved,
                       COALESCE(SUM(CASE WHEN status = 'MAINTENANCE'
                           THEN GREATEST(capacity - COALESCE(occupied_count, 0) - COALESCE(reserved_count, 0), 0)
                           ELSE 0 END), 0) AS unavailable
                FROM property.rooms
                WHERE property_id = :propertyId AND COALESCE(is_active, true)
                """, Map.of("propertyId", propertyId), (rs, i) -> new BedCounts(
                rs.getInt("total"), rs.getInt("occupied"), rs.getInt("reserved"), rs.getInt("unavailable")));
    }

    /**
     * A room with at least one bed free to let now: its type, its beds, how many
     * are taken (occupied or reserved), and the IST date it was added.
     */
    public record RoomVacancy(UUID roomId, String roomType, int capacity, int taken, LocalDate createdOn) {}

    /**
     * Rooms with empty beds that can be let: active rooms not under maintenance
     * (whose empty beds are unavailable, as in {@link #bedCounts}).
     */
    public List<RoomVacancy> roomVacancies(UUID propertyId) {
        return jdbc.query("""
                SELECT id, room_type, capacity, COALESCE(occupied_count, 0) + COALESCE(reserved_count, 0) AS taken,
                       (created_at AT TIME ZONE 'Asia/Kolkata')::date AS created_on
                FROM property.rooms
                WHERE property_id = :propertyId AND COALESCE(is_active, true) AND COALESCE(status, '') <> 'MAINTENANCE'
                  AND capacity - COALESCE(occupied_count, 0) - COALESCE(reserved_count, 0) > 0
                ORDER BY id
                """, Map.of("propertyId", propertyId), (rs, i) -> new RoomVacancy(
                rs.getObject("id", UUID.class), rs.getString("room_type"), rs.getInt("capacity"), rs.getInt("taken"),
                rs.getObject("created_on", LocalDate.class)));
    }
}
