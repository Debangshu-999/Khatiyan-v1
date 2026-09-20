package com.khatiyan.d_modules.food.service;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.food.api.dto.FoodItemResponse;
import com.khatiyan.d_modules.food.api.dto.FoodModuleOverviewResponse;
import com.khatiyan.d_modules.food.api.dto.FoodProfileResponse;
import com.khatiyan.d_modules.food.api.dto.SaveFoodItemRequest;
import com.khatiyan.d_modules.food.api.dto.SaveFoodProfileRequest;
import com.khatiyan.d_modules.food.api.dto.UpdateFoodModuleStatusRequest;
import com.khatiyan.d_modules.food.model.FoodItem;
import com.khatiyan.d_modules.food.model.FoodProfile;
import com.khatiyan.d_modules.food.repository.FoodItemRepository;
import com.khatiyan.d_modules.food.repository.FoodMenuEntryRepository;
import com.khatiyan.d_modules.food.repository.FoodProfileRepository;
import com.khatiyan.d_modules.food.repository.FoodSubscriptionRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;

@Service
public class FoodCatalogService {

    private final PropertyModule propertyModule;
    private final FoodAccessPolicy accessPolicy;
    private final FoodModuleSettingService moduleSettingService;
    private final FoodItemRepository itemRepository;
    private final FoodProfileRepository profileRepository;
    private final FoodMenuEntryRepository menuEntryRepository;
    private final FoodSubscriptionRepository subscriptionRepository;

    public FoodCatalogService(
            PropertyModule propertyModule,
            FoodAccessPolicy accessPolicy,
            FoodModuleSettingService moduleSettingService,
            FoodItemRepository itemRepository,
            FoodProfileRepository profileRepository,
            FoodMenuEntryRepository menuEntryRepository,
            FoodSubscriptionRepository subscriptionRepository) {
        this.propertyModule = propertyModule;
        this.accessPolicy = accessPolicy;
        this.moduleSettingService = moduleSettingService;
        this.itemRepository = itemRepository;
        this.profileRepository = profileRepository;
        this.menuEntryRepository = menuEntryRepository;
        this.subscriptionRepository = subscriptionRepository;
    }

    @Transactional(readOnly = true)
    public FoodModuleOverviewResponse overview(UUID actorUserId, UUID propertyId) {
        accessPolicy.ensureCanView(actorUserId, propertyId);
        return overview(propertyModule.getActiveProperty(propertyId));
    }

    @Transactional
    public FoodModuleOverviewResponse updateStatus(
            UUID actorUserId,
            UUID propertyId,
            UpdateFoodModuleStatusRequest request) {
        PropertyResponse property = moduleSettingService.update(actorUserId, propertyId, request.enabled());
        return overview(property);
    }

    @Transactional
    public FoodItemResponse createItem(
            UUID actorUserId,
            UUID propertyId,
            SaveFoodItemRequest request) {
        ensureEnabledForManage(actorUserId, propertyId);
        ensureItemNameAvailable(propertyId, request.name(), null);
        FoodItem item = FoodItem.create(
                propertyId,
                actorUserId,
                request.name(),
                request.description(),
                request.imageUrl(),
                request.imagePublicId(),
                request.quantityUnit(),
                request.mealTags());
        return FoodItemResponse.from(itemRepository.save(item));
    }

    @Transactional(readOnly = true)
    public List<FoodItemResponse> listItems(UUID actorUserId, UUID propertyId) {
        accessPolicy.ensureCanView(actorUserId, propertyId);
        return itemRepository.findByPropertyIdAndDeletedAtIsNullOrderByActiveDescNameAsc(propertyId)
                .stream()
                .map(FoodItemResponse::from)
                .toList();
    }

    @Transactional
    public FoodItemResponse updateItem(
            UUID actorUserId,
            UUID itemId,
            SaveFoodItemRequest request) {
        FoodItem item = getActiveItem(itemId);
        ensureEnabledForManage(actorUserId, item.getPropertyId());
        ensureItemNameAvailable(item.getPropertyId(), request.name(), item.getId());
        item.update(
                request.name(),
                request.description(),
                request.imageUrl(),
                request.imagePublicId(),
                request.quantityUnit(),
                request.mealTags());
        return FoodItemResponse.from(item);
    }

    @Transactional
    public void deactivateItem(UUID actorUserId, UUID itemId) {
        FoodItem item = getActiveItem(itemId);
        ensureEnabledForManage(actorUserId, item.getPropertyId());
        if (menuEntryRepository.existsByItemIdAndActiveTrue(itemId)) {
            throw new ValidationException("Remove this item from active menus before deactivating it");
        }
        item.deactivate();
    }

    /**
     * Puts a retired item back in service.
     *
     * <p>The name is checked again rather than assumed. Retiring an item frees
     * its name — the uniqueness index only covers active rows — so another item
     * may have taken it in the meantime, and reactivating blindly would breach
     * the index at flush time with an error nobody could read.
     */
    @Transactional
    public FoodItemResponse reactivateItem(UUID actorUserId, UUID itemId) {
        FoodItem item = itemRepository.findByIdAndDeletedAtIsNull(itemId)
                .orElseThrow(() -> new NotFoundException("FoodItem", itemId));
        ensureEnabledForManage(actorUserId, item.getPropertyId());
        if (item.isCurrentlyActive()) {
            return FoodItemResponse.from(item);
        }
        ensureItemNameAvailable(item.getPropertyId(), item.getName(), item.getId());
        item.reactivate();
        return FoodItemResponse.from(item);
    }

    /**
     * Removes a retired item from the owner's list for good.
     *
     * <p>A soft delete. `food_menu_entries` holds a foreign key to this row, so
     * deleting it outright would either be refused by the database or take the
     * property's menu history with it — and that history is what past cooking
     * forecasts were computed from.
     */
    @Transactional
    public void deleteItem(UUID actorUserId, UUID itemId) {
        FoodItem item = itemRepository.findByIdAndDeletedAtIsNull(itemId)
                .orElseThrow(() -> new NotFoundException("FoodItem", itemId));
        ensureEnabledForManage(actorUserId, item.getPropertyId());
        item.markDeleted(Instant.now());
    }

    @Transactional
    public FoodProfileResponse createProfile(
            UUID actorUserId,
            UUID propertyId,
            SaveFoodProfileRequest request) {
        ensureEnabledForManage(actorUserId, propertyId);
        ensureProfileNameAvailable(propertyId, request.name(), null);
        FoodProfile profile = FoodProfile.create(
                propertyId,
                actorUserId,
                request.name(),
                request.description(),
                valueOrZero(request.displayOrder()));
        return FoodProfileResponse.from(profileRepository.save(profile));
    }

    @Transactional(readOnly = true)
    public List<FoodProfileResponse> listProfiles(UUID actorUserId, UUID propertyId) {
        accessPolicy.ensureCanView(actorUserId, propertyId);
        return profileRepository.findByPropertyIdAndActiveTrueOrderByDisplayOrderAscNameAsc(propertyId)
                .stream()
                .map(FoodProfileResponse::from)
                .toList();
    }

    @Transactional
    public FoodProfileResponse updateProfile(
            UUID actorUserId,
            UUID profileId,
            SaveFoodProfileRequest request) {
        FoodProfile profile = getActiveProfile(profileId);
        ensureEnabledForManage(actorUserId, profile.getPropertyId());
        ensureProfileNameAvailable(profile.getPropertyId(), request.name(), profile.getId());
        profile.update(request.name(), request.description(), valueOrZero(request.displayOrder()));
        return FoodProfileResponse.from(profile);
    }

    @Transactional
    public void deactivateProfile(UUID actorUserId, UUID profileId) {
        FoodProfile profile = getActiveProfile(profileId);
        ensureEnabledForManage(actorUserId, profile.getPropertyId());
        if (subscriptionRepository.existsByProfileIdAndActiveTrue(profileId)) {
            throw new ValidationException("Move or end active subscriptions before deactivating this profile");
        }
        profile.deactivate();
    }

    @Transactional(readOnly = true)
    FoodItem getActiveItem(UUID itemId) {
        return itemRepository.findByIdAndActiveTrue(itemId)
                .orElseThrow(() -> new NotFoundException("FoodItem", itemId));
    }

    @Transactional(readOnly = true)
    FoodProfile getActiveProfile(UUID profileId) {
        return profileRepository.findByIdAndActiveTrue(profileId)
                .orElseThrow(() -> new NotFoundException("FoodProfile", profileId));
    }

    private FoodModuleOverviewResponse overview(PropertyResponse property) {
        UUID propertyId = property.id();
        return new FoodModuleOverviewResponse(
                propertyId,
                property.foodIncluded(),
                property.foodIncluded() && moduleSettingService.isEnabled(propertyId),
                property.includedMeals(),
                itemRepository.countByPropertyIdAndActiveTrue(propertyId),
                profileRepository.countByPropertyIdAndActiveTrue(propertyId),
                subscriptionRepository.countByPropertyIdAndActiveTrue(propertyId));
    }

    private PropertyResponse ensureEnabledForManage(UUID actorUserId, UUID propertyId) {
        accessPolicy.ensureCanManage(actorUserId, propertyId);
        return moduleSettingService.requireUsable(propertyId);
    }

    private void ensureItemNameAvailable(UUID propertyId, String name, UUID currentId) {
        itemRepository.findByPropertyIdAndNameIgnoreCaseAndActiveTrue(propertyId, name.trim())
                .filter(existing -> !existing.getId().equals(currentId))
                .ifPresent(existing -> {
                    throw new ValidationException("A food item with this name already exists");
                });
    }

    private void ensureProfileNameAvailable(UUID propertyId, String name, UUID currentId) {
        profileRepository.findByPropertyIdAndNameIgnoreCaseAndActiveTrue(propertyId, name.trim())
                .filter(existing -> !existing.getId().equals(currentId))
                .ifPresent(existing -> {
                    throw new ValidationException("A food profile with this name already exists");
                });
    }

    private int valueOrZero(Integer value) {
        return value == null ? 0 : value;
    }
}
