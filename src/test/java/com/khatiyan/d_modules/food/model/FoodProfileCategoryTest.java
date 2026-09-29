package com.khatiyan.d_modules.food.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

/** A profile's category is required whenever the owner saves it. */
class FoodProfileCategoryTest {

    private static final UUID PROPERTY = UUID.randomUUID();
    private static final UUID ACTOR = UUID.randomUUID();

    @Test
    void aNewProfileKeepsItsCategory() {
        FoodProfile profile = FoodProfile.create(PROPERTY, ACTOR, "Veg premium", null, 0, FoodProfileCategory.VEG);

        assertThat(profile.getCategory()).isEqualTo(FoodProfileCategory.VEG);
    }

    @Test
    void aProfileCannotBeSavedWithoutACategory() {
        assertThatThrownBy(() -> FoodProfile.create(PROPERTY, ACTOR, "Veg", null, 0, null))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("category");

        FoodProfile profile = FoodProfile.create(PROPERTY, ACTOR, "Veg", null, 0, FoodProfileCategory.VEG);
        assertThatThrownBy(() -> profile.update("Veg", null, 0, null))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("category");
    }
}
