package com.khatiyan.d_modules.food.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.model.MealType;

class FoodMenuEntryTest {

    @Test
    void calculatesTheTargetForOneProfileBeforeAnyConsolidation() {
        FoodMenuEntry roti = entry(
                new BigDecimal("4"),
                BigDecimal.ZERO,
                0,
                new BigDecimal("2"),
                null);

        assertThat(roti.targetQuantity(6)).isEqualByComparingTo("26.000");
    }

    @Test
    void includesExpectedRepeatsAndRoundsUpToTheCookingBatch() {
        FoodMenuEntry rice = entry(
                new BigDecimal("1"),
                new BigDecimal("0.5"),
                50,
                BigDecimal.ZERO,
                new BigDecimal("2"));

        // Six base servings + three expected repeat half-servings = 7.5,
        // rounded to the next 2-serving batch.
        assertThat(rice.targetQuantity(6)).isEqualByComparingTo("8.000");
    }


    /**
     * A quantity finer than the column is refused where it is entered.
     *
     * <p>The entity normalises every quantity to three decimals and rejects
     * anything finer, so the forecast downstream can assume the scale rather
     * than defend against it. Pinned because the alternative — accepting it and
     * rounding later — would have the forecast raise ArithmeticException for a
     * whole property's meal, far from the field that caused it.
     */
    @Test
    void aQuantityFinerThanThreeDecimalsIsRefusedAtTheSource() {
        assertThatThrownBy(() -> entry(
                new BigDecimal("0.0625"),
                BigDecimal.ZERO,
                0,
                BigDecimal.ZERO,
                null))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("3 decimal places");
    }

    /**
     * Cooking rounds towards more, never less.
     *
     * <p>One subscriber at 10% repeat feeds 1.1 portions, not 1.0. Running out
     * is worse than a little waste, so {@code ceil} is deliberate — this test
     * exists so nobody "optimises" it to HALF_UP and quietly under-caters every
     * small property in the country.
     */
    @Test
    void anyRepeatPercentageAssumesAtLeastOnePersonGoesBack() {
        FoodMenuEntry dal = entry(
                new BigDecimal("1"),
                new BigDecimal("1"),
                10,
                BigDecimal.ZERO,
                null);

        // One subscriber, 10% repeat: ceil(0.1) = 1 person going back.
        assertThat(dal.targetQuantity(1)).isEqualByComparingTo("2.000");
        // Ten subscribers, 10%: exactly 1. No rounding to do.
        assertThat(dal.targetQuantity(10)).isEqualByComparingTo("11.000");
        // Eleven, 10%: ceil(1.1) = 2.
        assertThat(dal.targetQuantity(11)).isEqualByComparingTo("13.000");
    }

    /** Nobody subscribed means nothing to cook, not a buffer cooked for no one. */
    @Test
    void zeroSubscribersStillOnlyCooksTheStandingBuffer() {
        FoodMenuEntry curry = entry(
                new BigDecimal("1"),
                new BigDecimal("1"),
                50,
                new BigDecimal("2"),
                null);

        assertThat(curry.targetQuantity(0)).isEqualByComparingTo("2.000");
    }

    private FoodMenuEntry entry(
            BigDecimal base,
            BigDecimal repeat,
            int repeatPercentage,
            BigDecimal buffer,
            BigDecimal batchSize) {
        return FoodMenuEntry.create(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                DayOfWeek.MONDAY,
                MealType.LUNCH,
                base,
                repeat,
                repeatPercentage,
                buffer,
                batchSize,
                0);
    }
}
