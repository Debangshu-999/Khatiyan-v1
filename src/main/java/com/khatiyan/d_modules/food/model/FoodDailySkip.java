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
 * One item the kitchen is not cooking on one date.
 *
 * <p>The weekly menu is a repeating pattern rather than a calendar, so there is
 * nowhere in it to say "not this Thursday". This is that: the forecast drops
 * the item for that date and the menu every other Thursday depends on is
 * untouched.
 *
 * <p>Deleted rather than flagged when the owner changes their mind. There is
 * nothing to learn from a skip that was undone, and an is_active column here
 * would mean a uniqueness index that has to reason about it.
 */
@Entity
@Table(name = "food_daily_skips", schema = "food")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FoodDailySkip extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "item_id", nullable = false, updatable = false)
    private UUID itemId;

    @Column(name = "skip_date", nullable = false, updatable = false)
    private LocalDate skipDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "meal_type", nullable = false, updatable = false, length = 20)
    private MealType mealType;

    @Column(name = "created_by_user_id", nullable = false, updatable = false)
    private UUID createdByUserId;

    private FoodDailySkip(
            UUID propertyId,
            UUID itemId,
            LocalDate skipDate,
            MealType mealType,
            UUID createdByUserId) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.itemId = itemId;
        this.skipDate = skipDate;
        this.mealType = mealType;
        this.createdByUserId = createdByUserId;
    }

    public static FoodDailySkip create(
            UUID propertyId,
            UUID itemId,
            LocalDate skipDate,
            MealType mealType,
            UUID createdByUserId) {
        return new FoodDailySkip(propertyId, itemId, skipDate, mealType, createdByUserId);
    }
}
