package com.khatiyan.d_modules.food.service;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.util.Comparator;
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
import com.khatiyan.d_modules.food.api.dto.FoodMenuEntryResponse;
import com.khatiyan.d_modules.food.api.dto.FoodProfileMenuResponse;
import com.khatiyan.d_modules.food.api.dto.FoodProfileResponse;
import com.khatiyan.d_modules.food.api.dto.SaveFoodMenuEntryRequest;
import com.khatiyan.d_modules.food.model.FoodItem;
import com.khatiyan.d_modules.food.model.FoodMenuEntry;
import com.khatiyan.d_modules.food.model.FoodProfile;
import com.khatiyan.d_modules.food.repository.FoodItemRepository;
import com.khatiyan.d_modules.food.repository.FoodMenuEntryRepository;
import com.khatiyan.d_modules.food.repository.FoodProfileRepository;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.MealType;

@Service
public class FoodMenuService {

    private final FoodAccessPolicy accessPolicy;
    private final FoodModuleSettingService moduleSettingService;
    /**
     * Read only, to answer whether a menu entry's meal is still served.
     *
     * <p>{@code getActiveProperty} rather than {@code requireUsable}: listing a
     * menu must keep working when food MANAGEMENT is switched off, or an owner
     * who paused the module could not see what they had built.
     */
    private final PropertyModule propertyModule;
    private final FoodProfileRepository profileRepository;
    private final FoodItemRepository itemRepository;
    private final FoodMenuEntryRepository menuEntryRepository;

    public FoodMenuService(
            FoodAccessPolicy accessPolicy,
            FoodModuleSettingService moduleSettingService,
            PropertyModule propertyModule,
            FoodProfileRepository profileRepository,
            FoodItemRepository itemRepository,
            FoodMenuEntryRepository menuEntryRepository) {
        this.accessPolicy = accessPolicy;
        this.moduleSettingService = moduleSettingService;
        this.propertyModule = propertyModule;
        this.profileRepository = profileRepository;
        this.itemRepository = itemRepository;
        this.menuEntryRepository = menuEntryRepository;
    }

    @Transactional
    public FoodMenuEntryResponse create(
            UUID actorUserId,
            UUID propertyId,
            UUID profileId,
            SaveFoodMenuEntryRequest request) {
        PropertyResponse property = ensureEnabledForManage(actorUserId, propertyId);
        FoodProfile profile = requireProfileForProperty(profileId, propertyId);
        FoodItem item = requireItemForProperty(request.itemId(), propertyId);
        ensureMealAvailable(property, request.mealType());
        ensureSlotItemAvailable(profileId, request, null);

        FoodMenuEntry entry = FoodMenuEntry.create(
                propertyId,
                profile.getId(),
                item.getId(),
                actorUserId,
                request.dayOfWeek(),
                request.mealType(),
                request.baseQuantityPerSubscriber(),
                zeroIfNull(request.repeatQuantity()),
                valueOrZero(request.expectedRepeatPercentage()),
                zeroIfNull(request.fixedBufferQuantity()),
                request.batchSize(),
                valueOrZero(request.displayOrder()));
        // ensureMealAvailable ran above, so the meal is served by definition.
        return FoodMenuEntryResponse.from(menuEntryRepository.save(entry), item, true);
    }

    @Transactional(readOnly = true)
    public FoodProfileMenuResponse list(
            UUID actorUserId,
            UUID propertyId,
            UUID profileId) {
        accessPolicy.ensureCanView(actorUserId, propertyId);
        FoodProfile profile = requireProfileForProperty(profileId, propertyId);
        return response(profile);
    }

    @Transactional
    public FoodMenuEntryResponse update(
            UUID actorUserId,
            UUID entryId,
            SaveFoodMenuEntryRequest request) {
        FoodMenuEntry entry = menuEntryRepository.findByIdAndActiveTrue(entryId)
                .orElseThrow(() -> new NotFoundException("FoodMenuEntry", entryId));
        PropertyResponse property = ensureEnabledForManage(actorUserId, entry.getPropertyId());
        if (!entry.getItemId().equals(request.itemId())) {
            throw new ValidationException("Create a new menu entry to change its food item");
        }
        FoodItem item = requireItemForProperty(entry.getItemId(), entry.getPropertyId());
        ensureMealAvailable(property, request.mealType());
        ensureSlotItemAvailable(entry.getProfileId(), request, entry.getId());
        entry.update(
                request.dayOfWeek(),
                request.mealType(),
                request.baseQuantityPerSubscriber(),
                zeroIfNull(request.repeatQuantity()),
                valueOrZero(request.expectedRepeatPercentage()),
                zeroIfNull(request.fixedBufferQuantity()),
                request.batchSize(),
                valueOrZero(request.displayOrder()));
        // ensureMealAvailable ran above, so the meal is served by definition.
        return FoodMenuEntryResponse.from(entry, item, true);
    }

    @Transactional
    public void deactivate(UUID actorUserId, UUID entryId) {
        FoodMenuEntry entry = menuEntryRepository.findByIdAndActiveTrue(entryId)
                .orElseThrow(() -> new NotFoundException("FoodMenuEntry", entryId));
        ensureEnabledForManage(actorUserId, entry.getPropertyId());
        entry.deactivate();
    }

    /**
     * Internal tenant read. The caller establishes that the tenant currently
     * belongs to the profile's property before using this method.
     */
    @Transactional(readOnly = true)
    public FoodProfileMenuResponse listForTenant(UUID propertyId, UUID profileId) {
        FoodProfile profile = requireProfileForProperty(profileId, propertyId);
        return response(profile);
    }

    private FoodProfileMenuResponse response(FoodProfile profile) {
        return response(profile, propertyModule.getActiveProperty(profile.getPropertyId()).includedMeals());
    }

    private FoodProfileMenuResponse response(FoodProfile profile, Set<MealType> servedMeals) {
        List<FoodMenuEntry> entries = menuEntryRepository.findByProfileIdAndActiveTrue(profile.getId())
                .stream()
                .sorted(Comparator
                        .comparingInt((FoodMenuEntry entry) -> entry.getDayOfWeek().getValue())
                        .thenComparingInt(entry -> entry.getMealType().ordinal())
                        .thenComparingInt(FoodMenuEntry::getDisplayOrder))
                .toList();
        Map<UUID, FoodItem> items = itemRepository.findAllById(
                        entries.stream().map(FoodMenuEntry::getItemId).collect(Collectors.toSet()))
                .stream()
                .filter(FoodItem::isCurrentlyActive)
                .collect(Collectors.toMap(FoodItem::getId, Function.identity()));

        List<FoodMenuEntryResponse> responses = entries.stream()
                .filter(entry -> items.containsKey(entry.getItemId()))
                .map(entry -> FoodMenuEntryResponse.from(
                        entry,
                        items.get(entry.getItemId()),
                        servedMeals.contains(entry.getMealType())))
                .toList();
        return new FoodProfileMenuResponse(FoodProfileResponse.from(profile), responses);
    }

    private PropertyResponse ensureEnabledForManage(UUID actorUserId, UUID propertyId) {
        accessPolicy.ensureCanManage(actorUserId, propertyId);
        return moduleSettingService.requireUsable(propertyId);
    }

    private FoodProfile requireProfileForProperty(UUID profileId, UUID propertyId) {
        FoodProfile profile = profileRepository.findByIdAndActiveTrue(profileId)
                .orElseThrow(() -> new NotFoundException("FoodProfile", profileId));
        if (!profile.getPropertyId().equals(propertyId)) {
            throw new ValidationException("Food profile does not belong to this property");
        }
        return profile;
    }

    private FoodItem requireItemForProperty(UUID itemId, UUID propertyId) {
        FoodItem item = itemRepository.findByIdAndActiveTrue(itemId)
                .orElseThrow(() -> new NotFoundException("FoodItem", itemId));
        if (!item.getPropertyId().equals(propertyId)) {
            throw new ValidationException("Food item does not belong to this property");
        }
        return item;
    }

    private void ensureMealAvailable(PropertyResponse property, MealType mealType) {
        if (!property.includedMeals().contains(mealType)) {
            throw new ValidationException("This meal is not enabled in the property food settings");
        }
    }

    private void ensureSlotItemAvailable(
            UUID profileId,
            SaveFoodMenuEntryRequest request,
            UUID currentEntryId) {
        menuEntryRepository
                .findByProfileIdAndDayOfWeekAndMealTypeAndItemIdAndActiveTrue(
                        profileId, request.dayOfWeek(), request.mealType(), request.itemId())
                .filter(existing -> !existing.getId().equals(currentEntryId))
                .ifPresent(existing -> {
                    throw new ValidationException("This item is already in that profile meal");
                });
    }

    private BigDecimal zeroIfNull(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private int valueOrZero(Integer value) {
        return value == null ? 0 : value;
    }
}
