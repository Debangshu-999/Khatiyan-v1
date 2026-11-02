package com.khatiyan.d_modules.food.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class FoodDishTypeTest {

    @Test
    void aFirstGuessComesFromWholeWordsInTheName() {
        assertThat(FoodDishType.guess("Masala tea")).isEqualTo(FoodDishType.DRINK);
        assertThat(FoodDishType.guess("Egg curry")).isEqualTo(FoodDishType.NON_VEG);
        assertThat(FoodDishType.guess("Jeera rice")).isEqualTo(FoodDishType.COMMON);
        assertThat(FoodDishType.guess("Dal tadka")).isEqualTo(FoodDishType.COMMON);
        assertThat(FoodDishType.guess("Paneer butter masala")).isEqualTo(FoodDishType.VEG);
        // "tea" inside a word and "egg" inside a word are neither.
        assertThat(FoodDishType.guess("Steamed momos")).isEqualTo(FoodDishType.VEG);
        assertThat(FoodDishType.guess("Eggplant bharta")).isEqualTo(FoodDishType.VEG);
    }
}
