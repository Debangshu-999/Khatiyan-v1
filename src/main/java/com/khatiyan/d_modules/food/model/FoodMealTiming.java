package com.khatiyan.d_modules.food.model;

import java.time.LocalTime;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.d_modules.property.model.MealType;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * When one meal is served at one property, every day (IST).
 *
 * <p>One timetable per property, not per food profile. A property with no row
 * for a meal is on the default for it ({@code MealScheduleRules.DEFAULTS}), so
 * a row exists only once an owner has saved the timetable.
 */
@Entity
@Table(name = "food_meal_timings", schema = "food")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FoodMealTiming extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Enumerated(EnumType.STRING)
    @Column(name = "meal_type", nullable = false, updatable = false, length = 20)
    private MealType mealType;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    @Column(name = "updated_by_user_id", nullable = false)
    private UUID updatedByUserId;

    private FoodMealTiming(UUID propertyId, MealType mealType) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.mealType = mealType;
    }

    public static FoodMealTiming create(
            UUID propertyId, MealType mealType, LocalTime startTime, LocalTime endTime, UUID actorUserId) {
        FoodMealTiming timing = new FoodMealTiming(propertyId, mealType);
        timing.update(startTime, endTime, actorUserId);
        return timing;
    }

    /** The whole timetable is validated together before any row changes. */
    public void update(LocalTime startTime, LocalTime endTime, UUID actorUserId) {
        this.startTime = startTime;
        this.endTime = endTime;
        this.updatedByUserId = actorUserId;
    }
}
