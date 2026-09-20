package com.khatiyan.d_modules.food.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.food.api.dto.CookingForecastResponse;
import com.khatiyan.d_modules.food.api.dto.CookingForecastResponse.ConsolidatedItemForecast;
import com.khatiyan.d_modules.food.api.dto.CookingForecastResponse.ItemForecast;
import com.khatiyan.d_modules.food.api.dto.CookingForecastResponse.ProfileForecast;
import com.khatiyan.d_modules.food.api.dto.CookingForecastResponse.ProfileQuantity;
import com.khatiyan.d_modules.food.api.dto.CookingForecastResponse.SkippedItem;
import com.khatiyan.d_modules.food.model.FoodDailySkip;
import com.khatiyan.d_modules.food.model.FoodItem;
import com.khatiyan.d_modules.food.model.FoodMenuEntry;
import com.khatiyan.d_modules.food.model.FoodProfile;
import com.khatiyan.d_modules.food.model.FoodSubscription;
import com.khatiyan.d_modules.food.repository.FoodDailySkipRepository;
import com.khatiyan.d_modules.food.repository.FoodItemRepository;
import com.khatiyan.d_modules.food.repository.FoodMenuEntryRepository;
import com.khatiyan.d_modules.food.repository.FoodProfileRepository;
import com.khatiyan.d_modules.food.repository.FoodSubscriptionRepository;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

@Service
public class FoodForecastService {

    private final TenancyModule tenancyModule;
    private final FoodModuleSettingService moduleSettingService;
    private final FoodAccessPolicy accessPolicy;
    private final FoodProfileRepository profileRepository;
    private final FoodItemRepository itemRepository;
    private final FoodMenuEntryRepository menuEntryRepository;
    private final FoodSubscriptionRepository subscriptionRepository;
    private final FoodDailySkipRepository dailySkipRepository;

    public FoodForecastService(
            TenancyModule tenancyModule,
            FoodModuleSettingService moduleSettingService,
            FoodAccessPolicy accessPolicy,
            FoodProfileRepository profileRepository,
            FoodItemRepository itemRepository,
            FoodMenuEntryRepository menuEntryRepository,
            FoodSubscriptionRepository subscriptionRepository,
            FoodDailySkipRepository dailySkipRepository) {
        this.tenancyModule = tenancyModule;
        this.moduleSettingService = moduleSettingService;
        this.accessPolicy = accessPolicy;
        this.profileRepository = profileRepository;
        this.itemRepository = itemRepository;
        this.menuEntryRepository = menuEntryRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.dailySkipRepository = dailySkipRepository;
    }

    /**
     * Takes one item off ONE date's cooking.
     *
     * <p>The weekly menu is untouched: next week's same weekday still includes
     * it. Calling this twice is the same fact stated twice, so the second call
     * is a no-op rather than a failure.
     */
    @Transactional
    public void markUnavailable(
            UUID actorUserId,
            UUID propertyId,
            LocalDate date,
            MealType mealType,
            UUID itemId) {
        accessPolicy.ensureCanManage(actorUserId, propertyId);
        moduleSettingService.requireUsable(propertyId);
        itemRepository.findByIdAndActiveTrue(itemId)
                .filter(item -> item.getPropertyId().equals(propertyId))
                .orElseThrow(() -> new NotFoundException("FoodItem", itemId));
        if (dailySkipRepository
                .findByPropertyIdAndSkipDateAndMealTypeAndItemId(propertyId, date, mealType, itemId)
                .isPresent()) {
            return;
        }
        dailySkipRepository.save(
                FoodDailySkip.create(propertyId, itemId, date, mealType, actorUserId));
    }

    /** Puts it back on that date. Undoing something that is not skipped is fine. */
    @Transactional
    public void markAvailable(
            UUID actorUserId,
            UUID propertyId,
            LocalDate date,
            MealType mealType,
            UUID itemId) {
        accessPolicy.ensureCanManage(actorUserId, propertyId);
        moduleSettingService.requireUsable(propertyId);
        dailySkipRepository
                .findByPropertyIdAndSkipDateAndMealTypeAndItemId(propertyId, date, mealType, itemId)
                .ifPresent(dailySkipRepository::delete);
    }

    @Transactional(readOnly = true)
    public CookingForecastResponse forecast(
            UUID actorUserId,
            UUID propertyId,
            LocalDate date,
            MealType mealType) {
        accessPolicy.ensureCanView(actorUserId, propertyId);
        PropertyResponse property = moduleSettingService.requireUsable(propertyId);
        if (!property.includedMeals().contains(mealType)) {
            throw new ValidationException("This meal is not enabled in the property food settings");
        }

        Map<UUID, FoodProfile> profiles = profileRepository
                .findByPropertyIdAndActiveTrueOrderByDisplayOrderAscNameAsc(propertyId)
                .stream()
                .collect(Collectors.toMap(FoodProfile::getId, Function.identity()));
        var activeTenancyIds = tenancyModule.findActiveByPropertyId(propertyId)
                .stream()
                .map(TenancyResponse::id)
                .collect(Collectors.toSet());
        Map<UUID, Integer> subscribersByProfile = subscriptionRepository
                .findByPropertyIdAndActiveTrue(propertyId)
                .stream()
                .filter(subscription -> activeTenancyIds.contains(subscription.getTenancyId()))
                .filter(subscription -> profiles.containsKey(subscription.getProfileId()))
                .collect(Collectors.groupingBy(
                        FoodSubscription::getProfileId,
                        Collectors.summingInt(subscription -> 1)));

        List<FoodMenuEntry> entries = menuEntryRepository
                .findByPropertyIdAndDayOfWeekAndMealTypeAndActiveTrueOrderByDisplayOrderAsc(
                        propertyId, date.getDayOfWeek(), mealType)
                .stream()
                .filter(entry -> profiles.containsKey(entry.getProfileId()))
                .filter(entry -> subscribersByProfile.getOrDefault(entry.getProfileId(), 0) > 0)
                .toList();
        Map<UUID, FoodItem> items = itemRepository
                .findAllById(entries.stream().map(FoodMenuEntry::getItemId).collect(Collectors.toSet()))
                .stream()
                .filter(FoodItem::isCurrentlyActive)
                .collect(Collectors.toMap(FoodItem::getId, Function.identity()));

        // Items the owner took off this DATE. Read after the menu, because a
        // skip only means something for an item the menu actually serves.
        Set<UUID> skippedItemIds = dailySkipRepository
                .findByPropertyIdAndSkipDateAndMealType(propertyId, date, mealType)
                .stream()
                .map(FoodDailySkip::getItemId)
                .collect(Collectors.toSet());

        List<SkippedItem> unavailableItems = entries.stream()
                .map(FoodMenuEntry::getItemId)
                .distinct()
                .filter(skippedItemIds::contains)
                .map(items::get)
                .filter(item -> item != null)
                .map(item -> new SkippedItem(item.getId(), item.getName(), item.getQuantityUnit()))
                .toList();

        Map<UUID, List<FoodMenuEntry>> entriesByProfile = entries.stream()
                .filter(entry -> items.containsKey(entry.getItemId()))
                .filter(entry -> !skippedItemIds.contains(entry.getItemId()))
                .collect(Collectors.groupingBy(
                        FoodMenuEntry::getProfileId,
                        LinkedHashMap::new,
                        Collectors.toList()));

        List<ProfileForecast> profileForecasts = new ArrayList<>();
        Map<UUID, ConsolidatedAccumulator> consolidated = new LinkedHashMap<>();

        profiles.values().stream()
                .sorted(Comparator.comparingInt(FoodProfile::getDisplayOrder)
                        .thenComparing(FoodProfile::getName))
                .forEach(profile -> {
                    int subscriberCount = subscribersByProfile.getOrDefault(profile.getId(), 0);
                    if (subscriberCount == 0) {
                        return;
                    }
                    List<FoodMenuEntry> profileEntries =
                            entriesByProfile.getOrDefault(profile.getId(), List.of());
                    if (profileEntries.isEmpty()) {
                        // Subscribers, but nothing on this profile's menu for
                        // this meal. They are not eating here, so there is
                        // nothing to cook and nobody to count. A gap worth an
                        // owner's attention belongs in the menu editor, not in
                        // a sheet the kitchen reads at six in the morning.
                        return;
                    }
                    List<ItemForecast> itemForecasts = profileEntries
                            .stream()
                            .map(entry -> {
                                FoodItem item = items.get(entry.getItemId());
                                BigDecimal quantity = entry.targetQuantity(subscriberCount);
                                consolidated
                                        .computeIfAbsent(item.getId(), ignored -> new ConsolidatedAccumulator(item))
                                        .add(profile, quantity);
                                return new ItemForecast(
                                        item.getId(),
                                        item.getName(),
                                        item.getQuantityUnit(),
                                        quantity);
                            })
                            .toList();
                    profileForecasts.add(new ProfileForecast(
                            profile.getId(),
                            profile.getName(),
                            subscriberCount,
                            itemForecasts));
                });

        List<ConsolidatedItemForecast> consolidatedItems = consolidated.values()
                .stream()
                .map(ConsolidatedAccumulator::response)
                .toList();

        // Only the people actually being cooked for. Summing every profile's
        // subscribers counted those on a profile with NO items at this meal —
        // so a breakfast forecast for a property whose "Gym" profile serves no
        // breakfast reported more mouths than the quantities below it feed, and
        // any screen putting the two side by side read as a bug.
        int totalSubscribers = profileForecasts.stream()
                .mapToInt(ProfileForecast::subscriberCount)
                .sum();

        return new CookingForecastResponse(
                propertyId,
                date,
                mealType,
                totalSubscribers,
                profileForecasts,
                consolidatedItems,
                unavailableItems);
    }

    private static final class ConsolidatedAccumulator {
        private final FoodItem item;
        private BigDecimal total = BigDecimal.ZERO.setScale(3);
        private final List<ProfileQuantity> breakdown = new ArrayList<>();

        private ConsolidatedAccumulator(FoodItem item) {
            this.item = item;
        }

        private void add(FoodProfile profile, BigDecimal quantity) {
            total = total.add(quantity);
            breakdown.add(new ProfileQuantity(profile.getId(), profile.getName(), quantity));
        }

        private ConsolidatedItemForecast response() {
            return new ConsolidatedItemForecast(
                    item.getId(),
                    item.getName(),
                    item.getQuantityUnit(),
                    total,
                    List.copyOf(breakdown));
        }
    }
}
