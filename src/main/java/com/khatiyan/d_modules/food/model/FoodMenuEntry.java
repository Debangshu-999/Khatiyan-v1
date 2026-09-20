package com.khatiyan.d_modules.food.model;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;
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

@Entity
@Table(name = "food_menu_entries", schema = "food")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FoodMenuEntry extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "profile_id", nullable = false, updatable = false)
    private UUID profileId;

    @Column(name = "item_id", nullable = false, updatable = false)
    private UUID itemId;

    @Column(name = "created_by_user_id", nullable = false, updatable = false)
    private UUID createdByUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "day_of_week", nullable = false, length = 12)
    private DayOfWeek dayOfWeek;

    @Enumerated(EnumType.STRING)
    @Column(name = "meal_type", nullable = false, length = 20)
    private MealType mealType;

    @Column(name = "base_quantity_per_subscriber", nullable = false, precision = 12, scale = 3)
    private BigDecimal baseQuantityPerSubscriber;

    @Column(name = "repeat_quantity", nullable = false, precision = 12, scale = 3)
    private BigDecimal repeatQuantity;

    @Column(name = "expected_repeat_percentage", nullable = false)
    private int expectedRepeatPercentage;

    @Column(name = "fixed_buffer_quantity", nullable = false, precision = 12, scale = 3)
    private BigDecimal fixedBufferQuantity;

    @Column(name = "batch_size", precision = 12, scale = 3)
    private BigDecimal batchSize;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    private FoodMenuEntry(
            UUID propertyId,
            UUID profileId,
            UUID itemId,
            UUID createdByUserId,
            DayOfWeek dayOfWeek,
            MealType mealType,
            BigDecimal baseQuantityPerSubscriber,
            BigDecimal repeatQuantity,
            int expectedRepeatPercentage,
            BigDecimal fixedBufferQuantity,
            BigDecimal batchSize,
            int displayOrder) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.profileId = profileId;
        this.itemId = itemId;
        this.createdByUserId = createdByUserId;
        update(
                dayOfWeek, mealType, baseQuantityPerSubscriber, repeatQuantity,
                expectedRepeatPercentage, fixedBufferQuantity, batchSize, displayOrder);
        this.active = true;
    }

    public static FoodMenuEntry create(
            UUID propertyId,
            UUID profileId,
            UUID itemId,
            UUID createdByUserId,
            DayOfWeek dayOfWeek,
            MealType mealType,
            BigDecimal baseQuantityPerSubscriber,
            BigDecimal repeatQuantity,
            int expectedRepeatPercentage,
            BigDecimal fixedBufferQuantity,
            BigDecimal batchSize,
            int displayOrder) {
        return new FoodMenuEntry(
                propertyId, profileId, itemId, createdByUserId, dayOfWeek, mealType,
                baseQuantityPerSubscriber, repeatQuantity, expectedRepeatPercentage,
                fixedBufferQuantity, batchSize, displayOrder);
    }

    public void update(
            DayOfWeek dayOfWeek,
            MealType mealType,
            BigDecimal baseQuantityPerSubscriber,
            BigDecimal repeatQuantity,
            int expectedRepeatPercentage,
            BigDecimal fixedBufferQuantity,
            BigDecimal batchSize,
            int displayOrder) {
        if (dayOfWeek == null || mealType == null) {
            throw new ValidationException("Menu day and meal are required");
        }
        this.dayOfWeek = dayOfWeek;
        this.mealType = mealType;
        this.baseQuantityPerSubscriber = positive(baseQuantityPerSubscriber, "Base quantity");
        this.repeatQuantity = nonNegative(repeatQuantity, "Repeat quantity");
        if (expectedRepeatPercentage < 0 || expectedRepeatPercentage > 100) {
            throw new ValidationException("Expected repeat percentage must be between 0 and 100");
        }
        this.expectedRepeatPercentage = expectedRepeatPercentage;
        this.fixedBufferQuantity = nonNegative(fixedBufferQuantity, "Fixed buffer quantity");
        this.batchSize = batchSize == null ? null : positive(batchSize, "Batch size");
        if (displayOrder < 0) {
            throw new ValidationException("Menu display order cannot be negative");
        }
        this.displayOrder = displayOrder;
    }

    /**
     * Safe cooking target for this profile entry only. Identical item targets
     * from other profiles are consolidated after this calculation.
     */
    public BigDecimal targetQuantity(int subscriberCount) {
        if (subscriberCount < 0) {
            throw new ValidationException("Subscriber count cannot be negative");
        }
        BigDecimal subscribers = BigDecimal.valueOf(subscriberCount);

        // CEILING, and deliberately so: a non-zero repeat percentage always
        // assumes at least one person goes back for more. One subscriber at 10%
        // cooks for 1.1 portions rather than 1.0. Running out of food is worse
        // than a little waste, so this rounds towards cooking more. Do not
        // "optimise" it to HALF_UP — there is a test holding it here.
        BigDecimal repeatPeople = subscribers
                .multiply(BigDecimal.valueOf(expectedRepeatPercentage))
                .divide(BigDecimal.valueOf(100), 0, RoundingMode.CEILING);
        BigDecimal target = baseQuantityPerSubscriber.multiply(subscribers)
                .add(repeatQuantity.multiply(repeatPeople))
                .add(fixedBufferQuantity);

        if (batchSize != null && target.signum() > 0) {
            BigDecimal batches = target.divide(batchSize, 0, RoundingMode.CEILING);
            target = batchSize.multiply(batches);
        }

        // UNNECESSARY is an ASSERTION here, not an oversight. Every quantity is
        // normalised to scale 3 by `scale()` before it is ever stored, and the
        // arithmetic above only multiplies and adds — so a finer scale reaching
        // this line means somebody changed the formula in a way that loses
        // precision. Throwing surfaces that in a test; rounding would hide it
        // and quietly mis-cater.
        return target.setScale(3, RoundingMode.UNNECESSARY);
    }

    public void deactivate() {
        this.active = false;
    }

    public boolean isCurrentlyActive() {
        return active;
    }

    private static BigDecimal positive(BigDecimal value, String label) {
        BigDecimal normalized = scale(value, label);
        if (normalized.signum() <= 0) {
            throw new ValidationException(label + " must be greater than zero");
        }
        return normalized;
    }

    private static BigDecimal nonNegative(BigDecimal value, String label) {
        BigDecimal normalized = value == null ? BigDecimal.ZERO.setScale(3) : scale(value, label);
        if (normalized.signum() < 0) {
            throw new ValidationException(label + " cannot be negative");
        }
        return normalized;
    }

    private static BigDecimal scale(BigDecimal value, String label) {
        if (value == null) {
            throw new ValidationException(label + " is required");
        }
        try {
            return value.setScale(3, RoundingMode.UNNECESSARY);
        } catch (ArithmeticException exception) {
            throw new ValidationException(label + " supports at most 3 decimal places");
        }
    }
}
