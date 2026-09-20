package com.khatiyan.d_modules.food.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.food.api.dto.SaveFoodMenuEntryRequest;
import com.khatiyan.d_modules.food.model.FoodItem;
import com.khatiyan.d_modules.food.model.FoodMenuEntry;
import com.khatiyan.d_modules.food.model.FoodProfile;
import com.khatiyan.d_modules.food.model.FoodQuantityUnit;
import com.khatiyan.d_modules.food.repository.FoodItemRepository;
import com.khatiyan.d_modules.food.repository.FoodMenuEntryRepository;
import com.khatiyan.d_modules.food.repository.FoodProfileRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.MealType;

@ExtendWith(MockitoExtension.class)
class FoodMenuServiceTest {

    private static final UUID ACTOR = UUID.randomUUID();
    private static final UUID PROPERTY = UUID.randomUUID();

    @Mock private FoodAccessPolicy accessPolicy;
    @Mock private FoodModuleSettingService moduleSettingService;
    @Mock private FoodProfileRepository profileRepository;
    @Mock private FoodItemRepository itemRepository;
    @Mock private FoodMenuEntryRepository menuEntryRepository;
    @Mock private PropertyModule propertyModule;
    private FoodMenuService service;

    @BeforeEach
    void setUp() {
        service = new FoodMenuService(
                accessPolicy,
                moduleSettingService,
                propertyModule,
                profileRepository,
                itemRepository,
                menuEntryRepository);
    }

    @Test
    void menuCannotUseMealSlotMissingFromPropertySettings() {
        FoodProfile profile = FoodProfile.create(PROPERTY, ACTOR, "Veg", null, 0);
        FoodItem item = FoodItem.create(
                PROPERTY, ACTOR, "Roti", null, null, null, FoodQuantityUnit.PIECE, EnumSet.allOf(MealType.class));
        PropertyResponse property = FoodTestFixtures.property(
                PROPERTY, true, Set.of(MealType.LUNCH));
        when(moduleSettingService.requireUsable(PROPERTY)).thenReturn(property);
        when(profileRepository.findByIdAndActiveTrue(profile.getId()))
                .thenReturn(Optional.of(profile));
        when(itemRepository.findByIdAndActiveTrue(item.getId()))
                .thenReturn(Optional.of(item));

        SaveFoodMenuEntryRequest request = new SaveFoodMenuEntryRequest(
                item.getId(),
                DayOfWeek.MONDAY,
                MealType.DINNER,
                BigDecimal.ONE,
                BigDecimal.ZERO,
                0,
                BigDecimal.ZERO,
                null,
                0);

        assertThatThrownBy(() -> service.create(ACTOR, PROPERTY, profile.getId(), request))
                .isInstanceOf(ValidationException.class)
                .hasMessage("This meal is not enabled in the property food settings");
    }

    /**
     * An entry whose meal the property stopped serving is flagged, not hidden.
     *
     * <p>Creating an entry checks the meal is offered, but nothing revisits
     * existing rows when an owner later drops dinner. They stay active and the
     * forecast refuses that meal outright — so without this flag the only clue
     * an owner had was an error on a different screen.
     *
     * <p>Flagged rather than deleted on sight: dinner may be paused for a
     * month, and silently discarding a week of menu work they would have to
     * retype is the worse failure.
     */
    @Test
    void anEntryForAMealThePropertyNoLongerServesIsFlagged() {
        FoodProfile profile = FoodProfile.create(PROPERTY, ACTOR, "Veg", null, 0);
        FoodItem roti = FoodItem.create(
                PROPERTY, ACTOR, "Roti", null, null, null, FoodQuantityUnit.PIECE, EnumSet.allOf(MealType.class));
        FoodMenuEntry lunch = menuEntry(profile, roti, MealType.LUNCH);
        FoodMenuEntry dinner = menuEntry(profile, roti, MealType.DINNER);

        when(profileRepository.findByIdAndActiveTrue(profile.getId()))
                .thenReturn(Optional.of(profile));
        when(menuEntryRepository.findByProfileIdAndActiveTrue(profile.getId()))
                .thenReturn(List.of(lunch, dinner));
        when(itemRepository.findAllById(any())).thenReturn(List.of(roti));
        // The property serves lunch only now. The dinner entry is the orphan.
        when(propertyModule.getActiveProperty(PROPERTY))
                .thenReturn(FoodTestFixtures.property(PROPERTY, true, Set.of(MealType.LUNCH)));

        var menu = service.list(ACTOR, PROPERTY, profile.getId());

        assertThat(menu.entries())
                .filteredOn(entry -> entry.mealType() == MealType.LUNCH)
                .singleElement()
                .satisfies(entry -> assertThat(entry.mealStillServed()).isTrue());
        assertThat(menu.entries())
                .filteredOn(entry -> entry.mealType() == MealType.DINNER)
                .singleElement()
                .satisfies(entry -> assertThat(entry.mealStillServed()).isFalse());
    }

    private FoodMenuEntry menuEntry(FoodProfile profile, FoodItem item, MealType mealType) {
        return FoodMenuEntry.create(
                PROPERTY,
                profile.getId(),
                item.getId(),
                ACTOR,
                DayOfWeek.MONDAY,
                mealType,
                BigDecimal.ONE,
                BigDecimal.ZERO,
                0,
                BigDecimal.ZERO,
                null,
                0);
    }
}
