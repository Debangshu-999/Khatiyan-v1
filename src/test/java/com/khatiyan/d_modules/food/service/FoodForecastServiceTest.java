package com.khatiyan.d_modules.food.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.d_modules.food.api.dto.CookingForecastResponse;
import com.khatiyan.d_modules.food.model.FoodItem;
import com.khatiyan.d_modules.food.model.FoodMenuEntry;
import com.khatiyan.d_modules.food.model.FoodProfile;
import com.khatiyan.d_modules.food.model.FoodQuantityUnit;
import com.khatiyan.d_modules.food.model.FoodSubscription;
import com.khatiyan.d_modules.food.repository.FoodItemRepository;
import com.khatiyan.d_modules.food.repository.FoodMenuEntryRepository;
import com.khatiyan.d_modules.food.repository.FoodDailySkipRepository;
import com.khatiyan.d_modules.food.repository.FoodProfileRepository;
import com.khatiyan.d_modules.food.repository.FoodSubscriptionRepository;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

@ExtendWith(MockitoExtension.class)
class FoodForecastServiceTest {

    private static final UUID ACTOR = UUID.randomUUID();
    private static final UUID PROPERTY = UUID.randomUUID();
    private static final LocalDate MONDAY = LocalDate.of(2026, 9, 21);

    @Mock private TenancyModule tenancyModule;
    @Mock private FoodModuleSettingService moduleSettingService;
    @Mock private FoodAccessPolicy accessPolicy;
    @Mock private FoodProfileRepository profileRepository;
    @Mock private FoodItemRepository itemRepository;
    @Mock private FoodMenuEntryRepository menuEntryRepository;
    @Mock private FoodSubscriptionRepository subscriptionRepository;
    @Mock private FoodDailySkipRepository dailySkipRepository;
    private FoodForecastService service;

    @BeforeEach
    void setUp() {
        service = new FoodForecastService(
                tenancyModule,
                moduleSettingService,
                accessPolicy,
                profileRepository,
                itemRepository,
                menuEntryRepository,
                subscriptionRepository,
                dailySkipRepository);
    }

    @Test
    void forecastsProfilesSeparatelyThenConsolidatesSharedItems() {
        FoodProfile veg = FoodProfile.create(PROPERTY, ACTOR, "Veg", null, 0);
        FoodProfile nonVeg = FoodProfile.create(PROPERTY, ACTOR, "Non-veg", null, 1);
        FoodItem roti = FoodItem.create(
                PROPERTY, ACTOR, "Roti", null, null, null, FoodQuantityUnit.PIECE, EnumSet.allOf(MealType.class));
        FoodItem paneer = FoodItem.create(
                PROPERTY, ACTOR, "Paneer", null, null, null, FoodQuantityUnit.SERVING, EnumSet.allOf(MealType.class));
        FoodItem chicken = FoodItem.create(
                PROPERTY, ACTOR, "Chicken", null, null, null, FoodQuantityUnit.SERVING, EnumSet.allOf(MealType.class));

        List<FoodMenuEntry> entries = List.of(
                entry(veg, roti, "4", "2"),
                entry(veg, paneer, "1", "0"),
                entry(nonVeg, roti, "4", "2"),
                entry(nonVeg, chicken, "1", "0"));
        List<FoodSubscription> subscriptions = new ArrayList<>();
        List<TenancyResponse> tenancies = new ArrayList<>();
        for (int index = 0; index < 6; index++) {
            addSubscriber(subscriptions, tenancies, veg);
            addSubscriber(subscriptions, tenancies, nonVeg);
        }

        PropertyResponse property = FoodTestFixtures.property(
                PROPERTY, true, Set.of(MealType.LUNCH));
        when(moduleSettingService.requireUsable(PROPERTY)).thenReturn(property);
        when(profileRepository.findByPropertyIdAndActiveTrueOrderByDisplayOrderAscNameAsc(PROPERTY))
                .thenReturn(List.of(veg, nonVeg));
        when(tenancyModule.findActiveByPropertyId(PROPERTY)).thenReturn(tenancies);
        when(subscriptionRepository.findByPropertyIdAndActiveTrue(PROPERTY)).thenReturn(subscriptions);
        when(menuEntryRepository
                .findByPropertyIdAndDayOfWeekAndMealTypeAndActiveTrueOrderByDisplayOrderAsc(
                        PROPERTY, DayOfWeek.MONDAY, MealType.LUNCH))
                .thenReturn(entries);
        when(itemRepository.findAllById(any())).thenReturn(List.of(roti, paneer, chicken));

        CookingForecastResponse result =
                service.forecast(ACTOR, PROPERTY, MONDAY, MealType.LUNCH);

        assertThat(result.totalSubscribers()).isEqualTo(12);
        assertThat(result.profiles()).hasSize(2);
        assertThat(result.profiles())
                .allSatisfy(profile -> assertThat(profile.subscriberCount()).isEqualTo(6));

        CookingForecastResponse.ConsolidatedItemForecast rotiTotal = result.consolidatedItems()
                .stream()
                .filter(item -> item.itemName().equals("Roti"))
                .findFirst()
                .orElseThrow();
        assertThat(rotiTotal.targetQuantity()).isEqualByComparingTo("52.000");
        assertThat(rotiTotal.profileBreakdown())
                .extracting(CookingForecastResponse.ProfileQuantity::targetQuantity)
                .containsExactly(new BigDecimal("26.000"), new BigDecimal("26.000"));

        assertThat(result.consolidatedItems())
                .filteredOn(item -> item.itemName().equals("Paneer"))
                .singleElement()
                .satisfies(item -> assertThat(item.targetQuantity()).isEqualByComparingTo("6.000"));
        assertThat(result.consolidatedItems())
                .filteredOn(item -> item.itemName().equals("Chicken"))
                .singleElement()
                .satisfies(item -> assertThat(item.targetQuantity()).isEqualByComparingTo("6.000"));
    }


    /**
     * The total counts mouths being fed, not subscribers on the books.
     *
     * <p>A profile with subscribers but no items at this meal is not eating
     * here. Counting them made a breakfast forecast report more people than the
     * quantities beneath it feed, so any screen putting the two side by side
     * read as a bug.
     */
    @Test
    void profilesWithNothingOnTheMenuAreNotCountedAsBeingFed() {
        FoodProfile veg = FoodProfile.create(PROPERTY, ACTOR, "Veg", null, 0);
        FoodProfile gym = FoodProfile.create(PROPERTY, ACTOR, "Gym", null, 1);
        FoodItem roti = FoodItem.create(
                PROPERTY, ACTOR, "Roti", null, null, null, FoodQuantityUnit.PIECE, EnumSet.allOf(MealType.class));

        // Only Veg has a lunch item. Gym has subscribers and nothing cooked.
        List<FoodMenuEntry> entries = List.of(entry(veg, roti, "4", "0"));
        List<FoodSubscription> subscriptions = new ArrayList<>();
        List<TenancyResponse> tenancies = new ArrayList<>();
        addSubscriber(subscriptions, tenancies, veg);
        addSubscriber(subscriptions, tenancies, veg);
        addSubscriber(subscriptions, tenancies, gym);

        when(moduleSettingService.requireUsable(PROPERTY))
                .thenReturn(FoodTestFixtures.property(PROPERTY, true, Set.of(MealType.LUNCH)));
        when(profileRepository.findByPropertyIdAndActiveTrueOrderByDisplayOrderAscNameAsc(PROPERTY))
                .thenReturn(List.of(veg, gym));
        when(tenancyModule.findActiveByPropertyId(PROPERTY)).thenReturn(tenancies);
        when(subscriptionRepository.findByPropertyIdAndActiveTrue(PROPERTY)).thenReturn(subscriptions);
        when(menuEntryRepository
                .findByPropertyIdAndDayOfWeekAndMealTypeAndActiveTrueOrderByDisplayOrderAsc(
                        PROPERTY, DayOfWeek.MONDAY, MealType.LUNCH))
                .thenReturn(entries);
        when(itemRepository.findAllById(any())).thenReturn(List.of(roti));

        CookingForecastResponse result =
                service.forecast(ACTOR, PROPERTY, MONDAY, MealType.LUNCH);

        // Three people subscribe. Two are being cooked for.
        assertThat(result.totalSubscribers()).isEqualTo(2);
        assertThat(result.profiles()).singleElement()
                .satisfies(profile -> assertThat(profile.profileName()).isEqualTo("Veg"));
    }

    private FoodMenuEntry entry(FoodProfile profile, FoodItem item, String base, String buffer) {
        return FoodMenuEntry.create(
                PROPERTY,
                profile.getId(),
                item.getId(),
                ACTOR,
                DayOfWeek.MONDAY,
                MealType.LUNCH,
                new BigDecimal(base),
                BigDecimal.ZERO,
                0,
                new BigDecimal(buffer),
                null,
                0);
    }

    private void addSubscriber(
            List<FoodSubscription> subscriptions,
            List<TenancyResponse> tenancies,
            FoodProfile profile) {
        UUID tenancyId = UUID.randomUUID();
        UUID tenantId = UUID.randomUUID();
        subscriptions.add(FoodSubscription.start(PROPERTY, tenancyId, tenantId, profile.getId()));
        tenancies.add(FoodTestFixtures.tenancy(tenancyId, tenantId, PROPERTY));
    }
}
