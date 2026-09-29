package com.khatiyan.d_modules.food.model;

import java.time.LocalDate;
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
 * One meal pushed later on one date.
 *
 * <p>Holds the TOTAL delay from the planned start, so delaying the same meal a
 * second time replaces the figure rather than adding a row. The next day is on
 * the timetable again without anything having to reset it.
 */
@Entity
@Table(name = "food_meal_delays", schema = "food")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FoodMealDelay extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "meal_date", nullable = false, updatable = false)
    private LocalDate mealDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "meal_type", nullable = false, updatable = false, length = 20)
    private MealType mealType;

    @Column(name = "delay_minutes", nullable = false)
    private int delayMinutes;

    @Column(name = "delayed_by_user_id", nullable = false)
    private UUID delayedByUserId;

    private FoodMealDelay(UUID propertyId, LocalDate mealDate, MealType mealType) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.mealDate = mealDate;
        this.mealType = mealType;
    }

    public static FoodMealDelay create(
            UUID propertyId, LocalDate mealDate, MealType mealType, int delayMinutes, UUID actorUserId) {
        FoodMealDelay delay = new FoodMealDelay(propertyId, mealDate, mealType);
        delay.setTotal(delayMinutes, actorUserId);
        return delay;
    }

    /** The new total from the planned start. The rules have already checked it. */
    public void setTotal(int delayMinutes, UUID actorUserId) {
        this.delayMinutes = delayMinutes;
        this.delayedByUserId = actorUserId;
    }
}
