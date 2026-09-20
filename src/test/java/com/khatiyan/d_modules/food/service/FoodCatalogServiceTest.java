package com.khatiyan.d_modules.food.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.food.model.FoodItem;
import com.khatiyan.d_modules.food.model.FoodQuantityUnit;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.food.repository.FoodItemRepository;
import com.khatiyan.d_modules.food.repository.FoodMenuEntryRepository;
import com.khatiyan.d_modules.food.repository.FoodProfileRepository;
import com.khatiyan.d_modules.food.repository.FoodSubscriptionRepository;
import com.khatiyan.d_modules.property.PropertyModule;

@ExtendWith(MockitoExtension.class)
class FoodCatalogServiceTest {

    private static final UUID ACTOR = UUID.randomUUID();
    private static final UUID PROPERTY = UUID.randomUUID();

    @Mock private PropertyModule propertyModule;
    @Mock private FoodAccessPolicy accessPolicy;
    @Mock private FoodModuleSettingService moduleSettingService;
    @Mock private FoodItemRepository itemRepository;
    @Mock private FoodProfileRepository profileRepository;
    @Mock private FoodMenuEntryRepository menuEntryRepository;
    @Mock private FoodSubscriptionRepository subscriptionRepository;
    private FoodCatalogService service;

    @BeforeEach
    void setUp() {
        service = new FoodCatalogService(
                propertyModule,
                accessPolicy,
                moduleSettingService,
                itemRepository,
                profileRepository,
                menuEntryRepository,
                subscriptionRepository);
    }

    @Test
    void catalogueKeepsInactiveItemsAfterActiveItems() {
        FoodItem active = FoodItem.create(
                PROPERTY, ACTOR, "Dal", null, null, null, FoodQuantityUnit.GRAM, EnumSet.allOf(MealType.class));
        FoodItem inactive = FoodItem.create(
                PROPERTY, ACTOR, "Old curry", null, null, null, FoodQuantityUnit.SERVING, EnumSet.allOf(MealType.class));
        inactive.deactivate();

        when(itemRepository.findByPropertyIdAndDeletedAtIsNullOrderByActiveDescNameAsc(PROPERTY))
                .thenReturn(List.of(active, inactive));

        var result = service.listItems(ACTOR, PROPERTY);

        assertThat(result).extracting(item -> item.name()).containsExactly("Dal", "Old curry");
        assertThat(result).extracting(item -> item.active()).containsExactly(true, false);
    }

    /**
     * Retiring an item frees its name, so bringing one back has to ask again.
     *
     * <p>The uniqueness index only covers active rows. Reactivating blindly
     * would breach it at flush time, surfacing as a constraint violation nobody
     * outside the database could read.
     */
    @Test
    void anItemCannotComeBackUnderANameSomethingElseHasTaken() {
        FoodItem retired = FoodItem.create(
                PROPERTY, ACTOR, "Dal", null, null, null, FoodQuantityUnit.GRAM, EnumSet.allOf(MealType.class));
        retired.deactivate();
        FoodItem replacement = FoodItem.create(
                PROPERTY, ACTOR, "Dal", null, null, null, FoodQuantityUnit.SERVING, EnumSet.allOf(MealType.class));

        when(itemRepository.findByIdAndDeletedAtIsNull(retired.getId()))
                .thenReturn(Optional.of(retired));
        when(itemRepository.findByPropertyIdAndNameIgnoreCaseAndActiveTrue(PROPERTY, "Dal"))
                .thenReturn(Optional.of(replacement));

        assertThatThrownBy(() -> service.reactivateItem(ACTOR, retired.getId()))
                .isInstanceOf(ValidationException.class)
                .hasMessage("A food item with this name already exists");
        assertThat(retired.isCurrentlyActive()).isFalse();
    }

    @Test
    void aRetiredItemComesBackWhenItsNameIsStillFree() {
        FoodItem retired = FoodItem.create(
                PROPERTY, ACTOR, "Dal", null, null, null, FoodQuantityUnit.GRAM, EnumSet.allOf(MealType.class));
        retired.deactivate();

        when(itemRepository.findByIdAndDeletedAtIsNull(retired.getId()))
                .thenReturn(Optional.of(retired));
        when(itemRepository.findByPropertyIdAndNameIgnoreCaseAndActiveTrue(PROPERTY, "Dal"))
                .thenReturn(Optional.empty());

        var result = service.reactivateItem(ACTOR, retired.getId());

        assertThat(result.active()).isTrue();
        assertThat(result.deleted()).isFalse();
    }

    /**
     * Removal is a soft delete, and only of something already retired.
     *
     * <p>An item still in service has menu entries pointing at it, so removing
     * it straight from the list would strand them.
     */
    @Test
    void anItemInServiceCannotBeRemoved() {
        FoodItem inService = FoodItem.create(
                PROPERTY, ACTOR, "Dal", null, null, null, FoodQuantityUnit.GRAM, EnumSet.allOf(MealType.class));

        when(itemRepository.findByIdAndDeletedAtIsNull(inService.getId()))
                .thenReturn(Optional.of(inService));

        assertThatThrownBy(() -> service.deleteItem(ACTOR, inService.getId()))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Retire this food item before removing it");
        assertThat(inService.isDeleted()).isFalse();
    }

    @Test
    void removingARetiredItemMarksItRatherThanDeletingTheRow() {
        FoodItem retired = FoodItem.create(
                PROPERTY, ACTOR, "Dal", null, null, null, FoodQuantityUnit.GRAM, EnumSet.allOf(MealType.class));
        retired.deactivate();

        when(itemRepository.findByIdAndDeletedAtIsNull(retired.getId()))
                .thenReturn(Optional.of(retired));

        service.deleteItem(ACTOR, retired.getId());

        // The row survives: food_menu_entries carries a foreign key to it, and
        // the menu history is what past forecasts were computed from.
        assertThat(retired.isDeleted()).isTrue();
    }
}
