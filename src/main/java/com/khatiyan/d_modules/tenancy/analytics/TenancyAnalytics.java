package com.khatiyan.d_modules.tenancy.analytics;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The tenancy module's answers for owner analytics. Reads the {@code tenancy}
 * schema only.
 */
@Component
public class TenancyAnalytics {

    private final NamedParameterJdbcTemplate jdbc;

    public TenancyAnalytics(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Beds occupied, summed night by night over the range. A stay still running
     * counts to the range's end, as the P&L projects the current month. A daily
     * stay's last night is the one before its planned checkout.
     */
    public long occupiedBedDays(UUID propertyId, LocalDate from, LocalDate to) {
        Long days = jdbc.queryForObject("""
                SELECT COALESCE(SUM(GREATEST(0, LEAST(stay_end, CAST(:to AS date)) - GREATEST(start_date, CAST(:from AS date)) + 1)), 0)
                FROM (SELECT start_date,
                             COALESCE(end_date,
                                      CASE WHEN billing_type = 'DAILY' THEN planned_end_date - 1 END,
                                      CAST(:to AS date)) AS stay_end
                      FROM tenancy.tenancies
                      WHERE property_id = :propertyId
                        AND status NOT IN ('CANCELLED', 'PENDING_ACCEPTANCE', 'SCHEDULED')
                        AND start_date <= CAST(:to AS date)) stays
                """, new MapSqlParameterSource().addValue("propertyId", propertyId).addValue("from", from).addValue("to", to),
                Long.class);
        return days == null ? 0 : days;
    }

    public record ActiveStays(int monthly, int daily) {}

    /** Stays living in the property now, on notice included. A missing billing type is a monthly stay. */
    public ActiveStays activeStays(UUID propertyId) {
        return jdbc.queryForObject("""
                SELECT COUNT(*) FILTER (WHERE COALESCE(billing_type, 'MONTHLY') = 'MONTHLY') AS monthly,
                       COUNT(*) FILTER (WHERE billing_type = 'DAILY') AS daily
                FROM tenancy.tenancies
                WHERE property_id = :propertyId AND status IN ('ACTIVE', 'ON_NOTICE', 'ON_PREMATURE_NOTICE', 'PENDING_EXIT')
                """, Map.of("propertyId", propertyId), (rs, i) -> new ActiveStays(rs.getInt("monthly"), rs.getInt("daily")));
    }

    /**
     * A monthly stay that is living in the property, or waiting for the tenant
     * to accept its agreement ({@code PENDING_ACCEPTANCE}). {@code exitOn} is
     * its checkout date when one is set: a notice's end date, or a fixed term's
     * planned end.
     */
    public record MonthlyStay(UUID tenancyId, UUID userId, String status, LocalDate startDate, LocalDate exitOn,
            LocalDate agreementEndDate, Boolean idCheckConfirmed) {

        /** Living in the property now: moved in, notice or not. */
        public boolean live() {
            return "ACTIVE".equals(status) || "ON_NOTICE".equals(status) || "ON_PREMATURE_NOTICE".equals(status)
                    || "PENDING_EXIT".equals(status);
        }
    }

    public List<MonthlyStay> currentMonthlyStays(UUID propertyId) {
        return jdbc.query("""
                SELECT id, user_id, status, start_date, COALESCE(end_date, planned_end_date) AS exit_on,
                       agreement_end_date, id_check_confirmed
                FROM tenancy.tenancies
                WHERE property_id = :propertyId
                  AND status IN ('ACTIVE', 'ON_NOTICE', 'ON_PREMATURE_NOTICE', 'PENDING_EXIT', 'PENDING_ACCEPTANCE')
                  AND COALESCE(billing_type, 'MONTHLY') = 'MONTHLY'
                ORDER BY start_date, id
                """, Map.of("propertyId", propertyId), (rs, i) -> new MonthlyStay(
                rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class), rs.getString("status"),
                rs.getObject("start_date", LocalDate.class), rs.getObject("exit_on", LocalDate.class),
                rs.getObject("agreement_end_date", LocalDate.class), (Boolean) rs.getObject("id_check_confirmed")));
    }

    /**
     * Every date a bed was given up in each room, newest first: ended stays,
     * daily checkouts included (a bed is a bed), and executed room changes out
     * of the room, dated in IST.
     */
    public Map<UUID, List<LocalDate>> moveOutDatesByRoom(UUID propertyId) {
        Map<UUID, List<LocalDate>> byRoom = new LinkedHashMap<>();
        jdbc.query("""
                SELECT room_id, left_on FROM (
                    SELECT room_id, end_date AS left_on
                    FROM tenancy.tenancies
                    WHERE property_id = :propertyId AND status IN ('EXITED', 'EVICTED') AND end_date IS NOT NULL
                    UNION ALL
                    SELECT current_room_id, (executed_at AT TIME ZONE 'Asia/Kolkata')::date
                    FROM tenancy.tenancy_room_change_requests
                    WHERE property_id = :propertyId AND status = 'EXECUTED' AND executed_at IS NOT NULL
                ) moves
                ORDER BY left_on DESC
                """, Map.of("propertyId", propertyId), rs -> {
            byRoom.computeIfAbsent(rs.getObject("room_id", UUID.class), room -> new ArrayList<>())
                    .add(rs.getObject("left_on", LocalDate.class));
        });
        return byRoom;
    }

    public record DayMoves(LocalDate day, int moveIns, int moveOuts) {}

    /**
     * Monthly stays that began, and that ended, on each day of the range. A
     * move-in is a stay that actually started: never cancelled, not still
     * waiting for acceptance, not a future booking still waiting for its bed.
     * A move-out is an exit or an eviction.
     */
    public List<DayMoves> monthlyMoves(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.query("""
                SELECT day, SUM(ins) AS ins, SUM(outs) AS outs FROM (
                    SELECT start_date AS day, 1 AS ins, 0 AS outs
                    FROM tenancy.tenancies
                    WHERE property_id = :propertyId AND COALESCE(billing_type, 'MONTHLY') = 'MONTHLY'
                      AND status NOT IN ('CANCELLED', 'PENDING_ACCEPTANCE', 'SCHEDULED')
                      AND start_date BETWEEN :from AND :to
                    UNION ALL
                    SELECT end_date, 0, 1
                    FROM tenancy.tenancies
                    WHERE property_id = :propertyId AND COALESCE(billing_type, 'MONTHLY') = 'MONTHLY'
                      AND status IN ('EXITED', 'EVICTED')
                      AND end_date BETWEEN :from AND :to
                ) moves
                GROUP BY day
                ORDER BY day
                """, new MapSqlParameterSource().addValue("propertyId", propertyId).addValue("from", from).addValue("to", to),
                (rs, i) -> new DayMoves(rs.getObject("day", LocalDate.class), rs.getInt("ins"), rs.getInt("outs")));
    }

    /**
     * A stay's nights that touch a range, by type: the same nights
     * {@link #occupiedBedDays} counts. {@code end} is its last night: an ended
     * stay's end date, a daily stay's night before checkout, or the range's end
     * for a stay still running. The caller clips to the range.
     */
    public record StayInterval(boolean daily, LocalDate start, LocalDate end) {}

    public List<StayInterval> stayIntervals(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.query("""
                SELECT daily, start_date, stay_end FROM (
                    SELECT COALESCE(billing_type = 'DAILY', false) AS daily, start_date,
                           COALESCE(end_date,
                                    CASE WHEN billing_type = 'DAILY' THEN planned_end_date - 1 END,
                                    CAST(:to AS date)) AS stay_end
                    FROM tenancy.tenancies
                    WHERE property_id = :propertyId
                      AND status NOT IN ('CANCELLED', 'PENDING_ACCEPTANCE', 'SCHEDULED')
                      AND start_date <= CAST(:to AS date)) stays
                WHERE stay_end >= CAST(:from AS date)
                ORDER BY start_date
                """, new MapSqlParameterSource().addValue("propertyId", propertyId).addValue("from", from).addValue("to", to),
                (rs, i) -> new StayInterval(rs.getBoolean("daily"), rs.getObject("start_date", LocalDate.class),
                        rs.getObject("stay_end", LocalDate.class)));
    }
}
