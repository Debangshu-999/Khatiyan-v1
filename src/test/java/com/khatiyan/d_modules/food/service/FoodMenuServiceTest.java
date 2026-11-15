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
import com.khatiyan.d_modules.food.model.FoodProfileCategory;
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
    @Mock private com.khatiyan.d_modules.food.repository.FoodSubscriptionRepository subscriptionRepository;
    @Mock private org.springframework.context.ApplicationEventPublisher eventPublisher;
    private FoodMenuService service;

    @BeforeEach
    void setUp() {
        service = new FoodMenuService(
                accessPolicy,
                moduleSettingService,
                propertyModule,
                profileRepository,
                itemRepository,
                menuEntryRepository,
                subscriptionRepository,
                eventPublisher,
                java.time.Clock.fixed(java.time.Instant.parse("2026-09-21T04:30:00Z"), java.time.ZoneOffset.UTC));
    }

    @Test
    void menuCannotUseMealSlotMissingFromPropertySettings() {
        FoodProfile profile = FoodProfile.create(PROPERTY, ACTOR, "Veg", null, 0, FoodProfileCategory.VEG);
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
        FoodProfile profile = FoodProfile.create(PROPERTY, ACTOR, "Veg", null, 0, FoodProfileCategory.VEG);
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

    // ----- A plan's weekly menu changed tells its subscribers (P1.5.h.3, 2026-11-08) -----

    private static final java.time.LocalDate TODAY = java.time.LocalDate.of(2026, 9, 21);

    @Test
    void addingADishToAPlanTellsItsSubscribers() {
        FoodProfile veg = FoodProfile.create(PROPERTY, ACTOR, "Veg", null, 0, FoodProfileCategory.VEG);
        FoodItem roti = FoodItem.create(
                PROPERTY, ACTOR, "Roti", null, null, null, FoodQuantityUnit.PIECE, EnumSet.allOf(MealType.class));
        UUID vegTenant = UUID.randomUUID();
        when(moduleSettingService.requireUsable(PROPERTY))
                .thenReturn(FoodTestFixtures.property(PROPERTY, true, Set.of(MealType.LUNCH)));
        when(profileRepository.findByIdAndActiveTrue(veg.getId())).thenReturn(Optional.of(veg));
        when(itemRepository.findByIdAndActiveTrue(roti.getId())).thenReturn(Optional.of(roti));
        when(menuEntryRepository.save(any(FoodMenuEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(subscriptionRepository.findCurrentOrUpcoming(PROPERTY, TODAY)).thenReturn(List.of(
                com.khatiyan.d_modules.food.model.FoodSubscription.start(PROPERTY, UUID.randomUUID(), vegTenant,
                        com.khatiyan.d_modules.food.model.FoodSubscription.everyDay(veg.getId()), TODAY),
                com.khatiyan.d_modules.food.model.FoodSubscription.start(PROPERTY, UUID.randomUUID(), UUID.randomUUID(),
                        com.khatiyan.d_modules.food.model.FoodSubscription.everyDay(UUID.randomUUID()), TODAY)));

        service.create(ACTOR, PROPERTY, veg.getId(), menuRequest(roti, MealType.LUNCH, "1"));

        var event = org.mockito.ArgumentCaptor.forClass(com.khatiyan.d_modules.food.event.FoodMenuChangedEvent.class);
        org.mockito.Mockito.verify(eventPublisher).publishEvent(event.capture());
        assertThat(event.getValue().profileId()).isEqualTo(veg.getId());
        assertThat(event.getValue().profileName()).isEqualTo("Veg");
        assertThat(event.getValue().tenantUserIds()).containsExactly(vegTenant);
    }

    /** Quantities are the kitchen's numbers: the tenant's plate is the same dish on the same day. */
    @Test
    void aQuantityOnlyEditTellsNobody() {
        FoodItem roti = FoodItem.create(
                PROPERTY, ACTOR, "Roti", null, null, null, FoodQuantityUnit.PIECE, EnumSet.allOf(MealType.class));
        FoodMenuEntry entry = FoodMenuEntry.create(PROPERTY, UUID.randomUUID(), roti.getId(), ACTOR, DayOfWeek.MONDAY,
                MealType.LUNCH, BigDecimal.ONE, BigDecimal.ZERO, 0, BigDecimal.ZERO, null, 0);
        when(menuEntryRepository.findByIdAndActiveTrue(entry.getId())).thenReturn(Optional.of(entry));
        when(moduleSettingService.requireUsable(PROPERTY))
                .thenReturn(FoodTestFixtures.property(PROPERTY, true, Set.of(MealType.LUNCH)));
        when(itemRepository.findByIdAndActiveTrue(roti.getId())).thenReturn(Optional.of(roti));

        service.update(ACTOR, entry.getId(), menuRequest(roti, MealType.LUNCH, "2"));

        org.mockito.Mockito.verify(eventPublisher, org.mockito.Mockito.never()).publishEvent(any());
    }

    @Test
    void removingADishTellsThePlansSubscribers() {
        FoodProfile veg = FoodProfile.create(PROPERTY, ACTOR, "Veg", null, 0, FoodProfileCategory.VEG);
        FoodMenuEntry entry = FoodMenuEntry.create(PROPERTY, veg.getId(), UUID.randomUUID(), ACTOR, DayOfWeek.MONDAY,
                MealType.LUNCH, BigDecimal.ONE, BigDecimal.ZERO, 0, BigDecimal.ZERO, null, 0);
        UUID vegTenant = UUID.randomUUID();
        when(menuEntryRepository.findByIdAndActiveTrue(entry.getId())).thenReturn(Optional.of(entry));
        when(moduleSettingService.requireUsable(PROPERTY))
                .thenReturn(FoodTestFixtures.property(PROPERTY, true, Set.of(MealType.LUNCH)));
        when(profileRepository.findById(veg.getId())).thenReturn(Optional.of(veg));
        when(subscriptionRepository.findCurrentOrUpcoming(PROPERTY, TODAY)).thenReturn(List.of(
                com.khatiyan.d_modules.food.model.FoodSubscription.start(PROPERTY, UUID.randomUUID(), vegTenant,
                        com.khatiyan.d_modules.food.model.FoodSubscription.everyDay(veg.getId()), TODAY)));

        service.deactivate(ACTOR, entry.getId());

        var event = org.mockito.ArgumentCaptor.forClass(com.khatiyan.d_modules.food.event.FoodMenuChangedEvent.class);
        org.mockito.Mockito.verify(eventPublisher).publishEvent(event.capture());
        assertThat(event.getValue().tenantUserIds()).containsExactly(vegTenant);
    }

    private static SaveFoodMenuEntryRequest menuRequest(FoodItem item, MealType meal, String base) {
        return new SaveFoodMenuEntryRequest(
                item.getId(), DayOfWeek.MONDAY, meal, new BigDecimal(base), BigDecimal.ZERO, 0, BigDecimal.ZERO, null, 0);
    }
}
