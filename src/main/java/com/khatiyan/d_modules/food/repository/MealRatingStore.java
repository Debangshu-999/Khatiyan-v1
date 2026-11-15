package com.khatiyan.d_modules.food.repository;

import java.sql.Date;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.property.model.MealType;

/**
 * Ratings in plain SQL, like the attendance rows.
 *
 * <p>Every read for an owner is an aggregate, and {@link #reviews} selects the plan,
 * the dish and the words and nothing about who wrote them, so anonymity is decided
 * here rather than remembered at each screen.
 */
@Repository
public class MealRatingStore {

    /** One row per person per meal, their meal rating being the plain average of the dishes they rated. */
    private static final String PERSON_MEALS = """
            SELECT meal_date, meal_type, tenancy_id, profile_id, AVG(rating)::double precision AS person_rating
            FROM food.food_meal_ratings
            WHERE property_id = ? AND meal_date BETWEEN ? AND ?
            GROUP BY meal_date, meal_type, tenancy_id, profile_id
            """;

    private final JdbcTemplate jdbc;

    public MealRatingStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record NewRating(UUID itemId, int rating, String review) {
    }

    public record DayRating(LocalDate date, double sum, long people) {
    }

    public record PlanMealCell(LocalDate period, MealType mealType, UUID profileId, double rating, long people) {
    }

    public record PlanRating(UUID profileId, double rating) {
    }

    /** A dish's ratings on one plan, with the two weeks the change is worked from. */
    public record DishPlanRating(
            UUID itemId, UUID profileId, long count, double sum,
            long weekCount, double weekSum, long priorCount, double priorSum) {
    }

    public record DishPeriodRating(UUID itemId, long count, double sum, long priorCount, double priorSum) {
    }

    public record Review(UUID profileId, UUID itemId, String text) {
    }

    public boolean hasRated(UUID propertyId, LocalDate date, MealType meal, UUID tenancyId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM food.food_meal_ratings
                    WHERE property_id = ? AND meal_date = ? AND meal_type = ? AND tenancy_id = ?)
                """, Boolean.class, propertyId, Date.valueOf(date), meal.name(), tenancyId));
    }

    /** This tenancy's own ratings for one meal, for the tenant to see and change. */
    public List<NewRating> mine(UUID propertyId, LocalDate date, MealType meal, UUID tenancyId) {
        return jdbc.query("""
                SELECT item_id, rating, review FROM food.food_meal_ratings
                WHERE property_id = ? AND meal_date = ? AND meal_type = ? AND tenancy_id = ?
                """, (row, index) -> new NewRating(row.getObject("item_id", UUID.class), row.getInt("rating"),
                        row.getString("review")),
                propertyId, Date.valueOf(date), meal.name(), tenancyId);
    }

    /**
     * Puts this tenancy's ratings for a meal in place of whatever it gave before
     * (user, 2026-11-14: a rating can be changed while the meal is on offer). A
     * dish left out of the new set is no longer rated. Call inside a transaction.
     */
    public int replace(UUID propertyId, LocalDate date, MealType meal, UUID tenancyId, UUID userId, UUID profileId,
            List<NewRating> ratings) {
        jdbc.update("""
                DELETE FROM food.food_meal_ratings
                WHERE property_id = ? AND meal_date = ? AND meal_type = ? AND tenancy_id = ?
                """, propertyId, Date.valueOf(date), meal.name(), tenancyId);
        return insert(propertyId, date, meal, tenancyId, userId, profileId, ratings);
    }

    /** How many landed. Two submissions at once meet on the unique key. */
    public int insert(UUID propertyId, LocalDate date, MealType meal, UUID tenancyId, UUID userId, UUID profileId,
            List<NewRating> ratings) {
        int inserted = 0;
        for (NewRating rating : ratings) {
            inserted += jdbc.update("""
                    INSERT INTO food.food_meal_ratings (id, property_id, meal_date, meal_type, tenancy_id, user_id,
                        profile_id, item_id, rating, review)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT ON CONSTRAINT uq_food_meal_rating DO NOTHING
                    """, UUID.randomUUID(), propertyId, Date.valueOf(date), meal.name(), tenancyId, userId, profileId,
                    rating.itemId(), rating.rating(), rating.review());
        }
        return inserted;
    }

    public List<DayRating> byDay(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.query("SELECT meal_date, SUM(person_rating) AS total, COUNT(*) AS people FROM (" + PERSON_MEALS
                        + ") person GROUP BY meal_date",
                (rs, n) -> new DayRating(rs.getDate("meal_date").toLocalDate(), rs.getDouble("total"), rs.getLong("people")),
                propertyId, Date.valueOf(from), Date.valueOf(to));
    }

    /** The average over every person's meal in the range, or null with no ratings. */
    public Double average(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.queryForObject("SELECT AVG(person_rating) FROM (" + PERSON_MEALS + ") person", Double.class,
                propertyId, Date.valueOf(from), Date.valueOf(to));
    }

    /**
     * One meal's average so far, over each person's own average of their dishes,
     * or null before anyone has rated it (Home's card, user, 2026-11-09).
     */
    public Double mealAverage(UUID propertyId, LocalDate date, MealType meal) {
        return jdbc.queryForObject("""
                SELECT AVG(person_rating) FROM (
                    SELECT AVG(rating)::double precision AS person_rating
                    FROM food.food_meal_ratings
                    WHERE property_id = ? AND meal_date = ? AND meal_type = ?
                    GROUP BY tenancy_id
                ) person
                """, Double.class, propertyId, Date.valueOf(date), meal.name());
    }

    public List<DayRating> byMonth(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.query("SELECT date_trunc('month', meal_date)::date AS period, SUM(person_rating) AS total,"
                        + " COUNT(*) AS people FROM (" + PERSON_MEALS + ") person GROUP BY 1",
                (rs, n) -> new DayRating(rs.getDate("period").toLocalDate(), rs.getDouble("total"), rs.getLong("people")),
                propertyId, Date.valueOf(from), Date.valueOf(to));
    }

    public enum Grain {
        DAY("meal_date"),
        WEEK("date_trunc('week', meal_date)::date"),
        MONTH("date_trunc('month', meal_date)::date");

        private final String column;

        Grain(String column) {
            this.column = column;
        }
    }

    /** Each plan's meals by day, by the Monday of the week, or by the first of the month. */
    public List<PlanMealCell> planMeals(UUID propertyId, LocalDate from, LocalDate to, Grain grain) {
        String period = grain.column;
        return jdbc.query("SELECT " + period + " AS period, meal_type, profile_id, AVG(person_rating) AS rating,"
                        + " COUNT(*) AS people FROM (" + PERSON_MEALS + ") person GROUP BY 1, meal_type, profile_id",
                (rs, n) -> new PlanMealCell(rs.getDate("period").toLocalDate(), MealType.valueOf(rs.getString("meal_type")),
                        rs.getObject("profile_id", UUID.class), rs.getDouble("rating"), rs.getLong("people")),
                propertyId, Date.valueOf(from), Date.valueOf(to));
    }

    public List<PlanRating> plans(UUID propertyId, LocalDate from, LocalDate to) {
        return jdbc.query("SELECT profile_id, AVG(person_rating) AS rating FROM (" + PERSON_MEALS
                        + ") person GROUP BY profile_id",
                (rs, n) -> new PlanRating(rs.getObject("profile_id", UUID.class), rs.getDouble("rating")),
                propertyId, Date.valueOf(from), Date.valueOf(to));
    }

    /**
     * @param weekFrom the first day of the last 7
     * @param priorFrom the first day of the 7 before those
     */
    public List<DishPlanRating> dishes(UUID propertyId, LocalDate from, LocalDate to, LocalDate weekFrom, LocalDate priorFrom) {
        return jdbc.query("""
                SELECT item_id, profile_id, COUNT(*) AS total_count, SUM(rating) AS total_sum,
                    COUNT(*) FILTER (WHERE meal_date >= ?) AS week_count,
                    COALESCE(SUM(rating) FILTER (WHERE meal_date >= ?), 0) AS week_sum,
                    COUNT(*) FILTER (WHERE meal_date >= ? AND meal_date < ?) AS prior_count,
                    COALESCE(SUM(rating) FILTER (WHERE meal_date >= ? AND meal_date < ?), 0) AS prior_sum
                FROM food.food_meal_ratings
                WHERE property_id = ? AND meal_date BETWEEN ? AND ?
                GROUP BY item_id, profile_id
                """,
                (rs, n) -> new DishPlanRating(rs.getObject("item_id", UUID.class), rs.getObject("profile_id", UUID.class),
                        rs.getLong("total_count"), rs.getDouble("total_sum"), rs.getLong("week_count"),
                        rs.getDouble("week_sum"), rs.getLong("prior_count"), rs.getDouble("prior_sum")),
                Date.valueOf(weekFrom), Date.valueOf(weekFrom), Date.valueOf(priorFrom), Date.valueOf(weekFrom),
                Date.valueOf(priorFrom), Date.valueOf(weekFrom), propertyId, Date.valueOf(from), Date.valueOf(to));
    }

    /** Each dish over a span and the span before it, across every plan. */
    public List<DishPeriodRating> dishPeriods(UUID propertyId, LocalDate from, LocalDate to, LocalDate priorFrom, LocalDate priorTo) {
        return jdbc.query("""
                SELECT item_id,
                    COUNT(*) FILTER (WHERE meal_date BETWEEN ? AND ?) AS span_count,
                    COALESCE(SUM(rating) FILTER (WHERE meal_date BETWEEN ? AND ?), 0) AS span_sum,
                    COUNT(*) FILTER (WHERE meal_date BETWEEN ? AND ?) AS prior_count,
                    COALESCE(SUM(rating) FILTER (WHERE meal_date BETWEEN ? AND ?), 0) AS prior_sum
                FROM food.food_meal_ratings
                WHERE property_id = ? AND meal_date BETWEEN ? AND ?
                GROUP BY item_id
                """,
                (rs, n) -> new DishPeriodRating(rs.getObject("item_id", UUID.class), rs.getLong("span_count"),
                        rs.getDouble("span_sum"), rs.getLong("prior_count"), rs.getDouble("prior_sum")),
                Date.valueOf(from), Date.valueOf(to), Date.valueOf(from), Date.valueOf(to),
                Date.valueOf(priorFrom), Date.valueOf(priorTo), Date.valueOf(priorFrom), Date.valueOf(priorTo),
                propertyId, Date.valueOf(priorFrom), Date.valueOf(to));
    }

    /** Most recent first. No column here says who wrote one. */
    /**
     * Each person's latest written review of each dish (user, 2026-11-02): how it was cooked
     * most recently for them, and one voice however often they write. By the meal's date, as
     * that is when it was cooked. When there are more than fit, every dish gives up its older
     * reviews evenly, so a dish served early in the week is not lost to the ones served since.
     */
    public List<Review> reviews(UUID propertyId, LocalDate from, LocalDate to, int limit) {
        return jdbc.query("""
                SELECT profile_id, item_id, review FROM (
                    SELECT DISTINCT ON (user_id, item_id) profile_id, item_id, review, meal_date, created_at
                    FROM food.food_meal_ratings
                    WHERE property_id = ? AND meal_date BETWEEN ? AND ? AND review IS NOT NULL
                    ORDER BY user_id, item_id, meal_date DESC, created_at DESC
                ) latest
                ORDER BY ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY meal_date DESC, created_at DESC),
                    meal_date DESC, created_at DESC
                LIMIT ?
                """,
                (rs, n) -> new Review(rs.getObject("profile_id", UUID.class), rs.getObject("item_id", UUID.class),
                        rs.getString("review")),
                propertyId, Date.valueOf(from), Date.valueOf(to), limit);
    }

    /** The analysis still in its week, as stored. */
    public Optional<String> currentAnalysis(UUID propertyId, LocalDate today) {
        return jdbc.queryForList("""
                SELECT result::text FROM food.food_meal_review_analyses
                WHERE property_id = ? AND expires_on > ?
                ORDER BY generated_on DESC LIMIT 1
                """, String.class, propertyId, Date.valueOf(today)).stream().findFirst();
    }

    /** With no weekly limit, as on dev: a second run the same day replaces the first. */
    public void replaceAnalysis(UUID propertyId, LocalDate generatedOn, LocalDate expiresOn, UUID userId, String result) {
        jdbc.update("""
                INSERT INTO food.food_meal_review_analyses (id, property_id, generated_on, expires_on,
                    generated_by_user_id, result)
                VALUES (?, ?, ?, ?, ?, ?::jsonb)
                ON CONFLICT ON CONSTRAINT uq_food_meal_review_analysis
                DO UPDATE SET result = EXCLUDED.result, generated_by_user_id = EXCLUDED.generated_by_user_id
                """, UUID.randomUUID(), propertyId, Date.valueOf(generatedOn), Date.valueOf(expiresOn), userId, result);
    }

    /** False when another tap got there first. */
    public boolean insertAnalysis(UUID propertyId, LocalDate generatedOn, LocalDate expiresOn, UUID userId, String result) {
        return jdbc.update("""
                INSERT INTO food.food_meal_review_analyses (id, property_id, generated_on, expires_on,
                    generated_by_user_id, result)
                VALUES (?, ?, ?, ?, ?, ?::jsonb)
                ON CONFLICT ON CONSTRAINT uq_food_meal_review_analysis DO NOTHING
                """, UUID.randomUUID(), propertyId, Date.valueOf(generatedOn), Date.valueOf(expiresOn), userId, result) > 0;
    }
}
