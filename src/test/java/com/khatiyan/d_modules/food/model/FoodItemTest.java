package com.khatiyan.d_modules.food.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.model.MealType;

class FoodItemTest {

    private static final UUID PROPERTY = UUID.randomUUID();
    private static final UUID ACTOR = UUID.randomUUID();

    /**
     * An item with no meal tags matches no meal, so it could never be put on a
     * menu — it would sit in the catalogue as something visible and unusable.
     * Refusing at the entity means a seeder or an import cannot create one
     * either, not just a request that happens to carry the annotation.
     */
    @Test
    void anItemMustBeServedAtSomeMeal() {
        assertThatThrownBy(() -> item(EnumSet.noneOf(MealType.class)))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Choose at least one meal this item is served at");

        assertThatThrownBy(() -> item(null))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Choose at least one meal this item is served at");
    }

    /** Roti is dinner AND breakfast — one dish, two meals, not two items. */
    @Test
    void anItemCanBeServedAtSeveralMeals() {
        FoodItem roti = item(EnumSet.of(MealType.BREAKFAST, MealType.DINNER));

        assertThat(roti.servedAt(MealType.BREAKFAST)).isTrue();
        assertThat(roti.servedAt(MealType.DINNER)).isTrue();
        assertThat(roti.servedAt(MealType.LUNCH)).isFalse();
    }

    /**
     * Re-tagging replaces the set rather than adding to it.
     *
     * <p>The collection is cleared and refilled instead of reassigned, because
     * Hibernate tracks the instance it handed out — swapping in a fresh EnumSet
     * orphans the one it is managing. This is the behavioural proof of that.
     */
    @Test
    void retaggingReplacesTheOldMeals() {
        FoodItem tea = item(EnumSet.of(MealType.BREAKFAST, MealType.EVENING_SNACKS));

        tea.update("Tea", null, null, null, FoodQuantityUnit.SERVING, EnumSet.of(MealType.EVENING_SNACKS));

        assertThat(tea.getMealTags()).containsExactly(MealType.EVENING_SNACKS);
    }

    private static FoodItem item(Set<MealType> mealTags) {
        return FoodItem.create(
                PROPERTY, ACTOR, "Tea", null, null, null, FoodQuantityUnit.SERVING, mealTags);
    }
}
