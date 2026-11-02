package com.khatiyan.d_modules.food.repository;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.property.model.MealType;

/**
 * The attendance rows, in plain SQL.
 *
 * <p>Two people can open the same meal at once and two can scan the same pass.
 * The roster goes in with {@code ON CONFLICT DO NOTHING} and a scan lands only on
 * a row with no {@code attended_at}, so the database settles both, and neither
 * would suit a loaded entity holding an older copy.
 */
@Repository
public class MealAttendanceStore {

    private static final String COLUMNS = """
            id, property_id, meal_date, meal_type, tenancy_id, tenant_user_id, profile_id,
            pass_token, pass_code, attended_at
            """;

    private final JdbcTemplate jdbc;

    public MealAttendanceStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Row(
            UUID id,
            UUID propertyId,
            LocalDate mealDate,
            MealType mealType,
            UUID tenancyId,
            UUID tenantUserId,
            UUID profileId,
            String passToken,
            String passCode,
            Instant attendedAt) {
    }

    public record NewRow(UUID tenancyId, UUID tenantUserId, UUID profileId, String passToken, String passCode) {
    }

    public record MealCount(LocalDate mealDate, MealType mealType, long expected, long attended) {
    }

    public Optional<Row> findForTenancy(UUID propertyId, LocalDate date, MealType meal, UUID tenancyId) {
        return jdbc.query("SELECT " + COLUMNS + """
                FROM food.food_meal_attendance
                WHERE property_id = ? AND meal_date = ? AND meal_type = ? AND tenancy_id = ?
                """, MealAttendanceStore::row, propertyId, Date.valueOf(date), meal.name(), tenancyId).stream().findFirst();
    }

    public Optional<Row> findByToken(String token) {
        return jdbc.query("SELECT " + COLUMNS + "FROM food.food_meal_attendance WHERE pass_token = ?",
                MealAttendanceStore::row, token).stream().findFirst();
    }

    public Optional<Row> findByCode(UUID propertyId, LocalDate date, MealType meal, String code) {
        return jdbc.query("SELECT " + COLUMNS + """
                FROM food.food_meal_attendance
                WHERE property_id = ? AND meal_date = ? AND meal_type = ? AND pass_code = ?
                """, MealAttendanceStore::row, propertyId, Date.valueOf(date), meal.name(), code).stream().findFirst();
    }

    public Optional<Row> findById(UUID id) {
        return jdbc.query("SELECT " + COLUMNS + "FROM food.food_meal_attendance WHERE id = ?",
                MealAttendanceStore::row, id).stream().findFirst();
    }

    public List<Row> findForMeal(UUID propertyId, LocalDate date, MealType meal) {
        return jdbc.query("SELECT " + COLUMNS + """
                FROM food.food_meal_attendance
                WHERE property_id = ? AND meal_date = ? AND meal_type = ?
                """, MealAttendanceStore::row, propertyId, Date.valueOf(date), meal.name());
    }

    public boolean existsForMeal(UUID propertyId, LocalDate date, MealType meal) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM food.food_meal_attendance
                               WHERE property_id = ? AND meal_date = ? AND meal_type = ?)
                """, Boolean.class, propertyId, Date.valueOf(date), meal.name()));
    }

    /** Adds what is missing. A row someone else wrote first stays as it is. */
    public void insertMissing(UUID propertyId, LocalDate date, MealType meal, List<NewRow> rows) {
        jdbc.batchUpdate("""
                INSERT INTO food.food_meal_attendance (id, property_id, meal_date, meal_type, tenancy_id,
                    tenant_user_id, profile_id, pass_token, pass_code)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT DO NOTHING
                """, rows.stream().map(row -> new Object[] {
                        UUID.randomUUID(), propertyId, Date.valueOf(date), meal.name(), row.tenancyId(),
                        row.tenantUserId(), row.profileId(), row.passToken(), row.passCode() }).toList());
    }

    /** True if this call recorded it, false if the pass had already been scanned. */
    public boolean markAttended(UUID id, Instant at, UUID byUserId, String method) {
        return jdbc.update("""
                UPDATE food.food_meal_attendance
                SET attended_at = ?, recorded_by_user_id = ?, record_method = ?
                WHERE id = ? AND attended_at IS NULL
                """, Timestamp.from(at), byUserId, method, id) == 1;
    }

    /** Roster and scans per meal, in one query, for every meal in the range. */
    public List<MealCount> counts(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.query("""
                SELECT meal_date, meal_type, COUNT(*) AS expected, COUNT(attended_at) AS attended
                FROM food.food_meal_attendance
                WHERE property_id = ? AND meal_date BETWEEN ? AND ?
                GROUP BY meal_date, meal_type
                """, (rs, rowNum) -> new MealCount(
                        rs.getDate("meal_date").toLocalDate(),
                        MealType.valueOf(rs.getString("meal_type")),
                        rs.getLong("expected"),
                        rs.getLong("attended")),
                propertyId, Date.valueOf(from), Date.valueOf(to));
    }

    public enum Grain {
        DAY("a.meal_date"),
        WEEK("date_trunc('week', a.meal_date)::date"),
        MONTH("date_trunc('month', a.meal_date)::date");

        private final String column;

        Grain(String column) {
            this.column = column;
        }
    }

    public record PlanMealCount(LocalDate period, MealType mealType, UUID profileId, long attended, long expected) {
    }

    /**
     * Each plan's meals by day, by the Monday of the week, or by the first of the month. Only
     * meals with at least one scan: one with none was not recorded, which is not everyone
     * skipping. Today's meals not yet over are left out, because their count is still moving.
     */
    public List<PlanMealCount> planMeals(UUID propertyId, LocalDate from, LocalDate to, Grain grain, List<MealType> notOverOnLastDay) {
        String notOver = "{" + notOverOnLastDay.stream().map(MealType::name).collect(Collectors.joining(",")) + "}";
        return jdbc.query("""
                WITH recorded AS (
                    SELECT meal_date, meal_type FROM food.food_meal_attendance
                    WHERE property_id = ? AND meal_date BETWEEN ? AND ?
                    GROUP BY meal_date, meal_type
                    HAVING COUNT(attended_at) > 0
                )
                SELECT %s AS period, a.meal_type, a.profile_id, COUNT(*) AS expected, COUNT(a.attended_at) AS attended
                FROM food.food_meal_attendance a
                JOIN recorded r ON r.meal_date = a.meal_date AND r.meal_type = a.meal_type
                WHERE a.property_id = ? AND NOT (a.meal_date = ? AND a.meal_type = ANY(?::text[]))
                GROUP BY 1, a.meal_type, a.profile_id
                """.formatted(grain.column),
                (rs, rowNum) -> new PlanMealCount(
                        rs.getDate("period").toLocalDate(),
                        MealType.valueOf(rs.getString("meal_type")),
                        rs.getObject("profile_id", UUID.class),
                        rs.getLong("attended"),
                        rs.getLong("expected")),
                propertyId, Date.valueOf(from), Date.valueOf(to), propertyId, Date.valueOf(to), notOver);
    }

    public Optional<LocalDate> firstDate(UUID propertyId) {
        return Optional.ofNullable(jdbc.queryForObject(
                "SELECT MIN(meal_date) FROM food.food_meal_attendance WHERE property_id = ?",
                Date.class, propertyId)).map(Date::toLocalDate);
    }

    private static Row row(ResultSet rs, int rowNum) throws SQLException {
        Timestamp attendedAt = rs.getTimestamp("attended_at");
        return new Row(
                rs.getObject("id", UUID.class),
                rs.getObject("property_id", UUID.class),
                rs.getDate("meal_date").toLocalDate(),
                MealType.valueOf(rs.getString("meal_type")),
                rs.getObject("tenancy_id", UUID.class),
                rs.getObject("tenant_user_id", UUID.class),
                rs.getObject("profile_id", UUID.class),
                rs.getString("pass_token"),
                rs.getString("pass_code"),
                attendedAt == null ? null : attendedAt.toInstant());
    }
}
