package com.khatiyan.d_modules.food.service;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.food.api.dto.FoodProfileMenuResponse;
import com.khatiyan.d_modules.food.api.dto.FoodProfileResponse;
import com.khatiyan.d_modules.food.api.dto.FoodProfileSubscriberSummaryResponse;
import com.khatiyan.d_modules.food.api.dto.FoodSubscriptionResponse;
import com.khatiyan.d_modules.food.api.dto.FoodSubscriberResponse;
import com.khatiyan.d_modules.food.api.dto.SubscribeFoodProfileRequest;
import com.khatiyan.d_modules.food.api.dto.TenantFoodAvailabilityResponse;
import com.khatiyan.d_modules.food.model.FoodProfile;
import com.khatiyan.d_modules.food.model.FoodSubscription;
import com.khatiyan.d_modules.food.repository.FoodProfileRepository;
import com.khatiyan.d_modules.food.repository.FoodSubscriptionRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

@Service
public class FoodSubscriptionService {

    private final TenancyModule tenancyModule;
    private final PropertyModule propertyModule;
    private final FoodModuleSettingService moduleSettingService;
    private final FoodAccessPolicy accessPolicy;
    private final FoodProfileRepository profileRepository;
    private final FoodSubscriptionRepository subscriptionRepository;
    private final FoodMenuService menuService;

    public FoodSubscriptionService(
            TenancyModule tenancyModule,
            PropertyModule propertyModule,
            FoodModuleSettingService moduleSettingService,
            FoodAccessPolicy accessPolicy,
            FoodProfileRepository profileRepository,
            FoodSubscriptionRepository subscriptionRepository,
            FoodMenuService menuService) {
        this.tenancyModule = tenancyModule;
        this.propertyModule = propertyModule;
        this.moduleSettingService = moduleSettingService;
        this.accessPolicy = accessPolicy;
        this.profileRepository = profileRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.menuService = menuService;
    }

    @Transactional(readOnly = true)
    public TenantFoodAvailabilityResponse availability(UUID tenantUserId) {
        TenancyResponse tenancy = requireActiveAccountTenancy(tenantUserId);
        PropertyResponse property = propertyModule.getActiveProperty(tenancy.propertyId());
        boolean available = property.foodIncluded();
        return new TenantFoodAvailabilityResponse(
                property.id(),
                available,
                available && moduleSettingService.isEnabled(property.id()),
                available ? property.includedMeals() : java.util.Set.of());
    }

    @Transactional(readOnly = true)
    public List<FoodProfileResponse> listAvailableProfiles(UUID tenantUserId) {
        TenancyResponse tenancy = requireActiveAccountTenancy(tenantUserId);
        ensureFoodEnabled(tenancy.propertyId());
        return profileRepository
                .findByPropertyIdAndActiveTrueOrderByDisplayOrderAscNameAsc(tenancy.propertyId())
                .stream()
                .map(FoodProfileResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public FoodProfileMenuResponse getAvailableProfileMenu(UUID tenantUserId, UUID profileId) {
        TenancyResponse tenancy = requireActiveAccountTenancy(tenantUserId);
        ensureFoodEnabled(tenancy.propertyId());
        return menuService.listForTenant(tenancy.propertyId(), profileId);
    }

    @Transactional(readOnly = true)
    public Optional<FoodSubscriptionResponse> current(UUID tenantUserId) {
        TenancyResponse tenancy = requireActiveAccountTenancy(tenantUserId);
        ensureFoodEnabled(tenancy.propertyId());
        return subscriptionRepository.findByTenantUserIdAndActiveTrue(tenantUserId)
                .flatMap(subscription -> profileRepository.findByIdAndActiveTrue(subscription.getProfileId())
                        .map(profile -> FoodSubscriptionResponse.from(subscription, profile)));
    }

    @Transactional
    public FoodSubscriptionResponse subscribe(
            UUID tenantUserId,
            SubscribeFoodProfileRequest request) {
        TenancyResponse tenancy = requireActiveAccountTenancy(tenantUserId);
        ensureFoodEnabled(tenancy.propertyId());
        FoodProfile profile = requireProfileForProperty(request.profileId(), tenancy.propertyId());

        Optional<FoodSubscription> current =
                subscriptionRepository.findByTenantUserIdAndActiveTrue(tenantUserId);
        if (current.isPresent() && current.get().getProfileId().equals(profile.getId())) {
            return FoodSubscriptionResponse.from(current.get(), profile);
        }
        current.ifPresent(subscription -> subscription.end("Switched food profile"));
        if (current.isPresent()) {
            subscriptionRepository.flush();
        }

        FoodSubscription subscription = FoodSubscription.start(
                tenancy.propertyId(), tenancy.id(), tenantUserId, profile.getId());
        return FoodSubscriptionResponse.from(subscriptionRepository.save(subscription), profile);
    }

    @Transactional
    public void unsubscribe(UUID tenantUserId) {
        subscriptionRepository.findByTenantUserIdAndActiveTrue(tenantUserId)
                .ifPresent(subscription -> subscription.end("Tenant unsubscribed"));
    }

    @Transactional(readOnly = true)
    public List<FoodProfileSubscriberSummaryResponse> subscriberCounts(
            UUID actorUserId,
            UUID propertyId) {
        accessPolicy.ensureCanView(actorUserId, propertyId);
        var activeTenancyIds = tenancyModule.findActiveByPropertyId(propertyId)
                .stream()
                .map(TenancyResponse::id)
                .collect(java.util.stream.Collectors.toSet());
        var counts = subscriptionRepository.findByPropertyIdAndActiveTrue(propertyId)
                .stream()
                .filter(subscription -> activeTenancyIds.contains(subscription.getTenancyId()))
                .collect(java.util.stream.Collectors.groupingBy(
                        FoodSubscription::getProfileId,
                        java.util.stream.Collectors.counting()));
        return profileRepository.findByPropertyIdAndActiveTrueOrderByDisplayOrderAscNameAsc(propertyId)
                .stream()
                .map(profile -> new FoodProfileSubscriberSummaryResponse(
                        FoodProfileResponse.from(profile),
                        counts.getOrDefault(profile.getId(), 0L)))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<FoodSubscriberResponse> subscribers(UUID actorUserId, UUID propertyId) {
        accessPolicy.ensureCanView(actorUserId, propertyId);
        List<FoodSubscription> subscriptions =
                subscriptionRepository.findByPropertyIdAndActiveTrue(propertyId);
        if (subscriptions.isEmpty()) {
            return List.of();
        }

        var activeTenancyIds = tenancyModule.findActiveByPropertyId(propertyId).stream()
                .map(TenancyResponse::id)
                .collect(Collectors.toSet());
        Map<UUID, TenancyResponse> tenancies = tenancyModule.findByIds(activeTenancyIds);
        Map<UUID, FoodProfile> profiles = profileRepository
                .findByPropertyIdAndActiveTrueOrderByDisplayOrderAscNameAsc(propertyId)
                .stream()
                .collect(Collectors.toMap(FoodProfile::getId, Function.identity()));
        var roomIds = tenancies.values().stream()
                .map(TenancyResponse::roomId)
                .collect(Collectors.toSet());
        Map<UUID, RoomResponse> rooms = propertyModule.findRoomsForDisplay(propertyId, roomIds);

        return subscriptions.stream()
                .filter(subscription -> activeTenancyIds.contains(subscription.getTenancyId()))
                .map(subscription -> {
                    TenancyResponse tenancy = tenancies.get(subscription.getTenancyId());
                    FoodProfile profile = profiles.get(subscription.getProfileId());
                    if (tenancy == null || profile == null) {
                        return null;
                    }
                    RoomResponse room = rooms.get(tenancy.roomId());
                    return new FoodSubscriberResponse(
                            subscription.getId(),
                            tenancy.id(),
                            subscription.getTenantUserId(),
                            tenancy.tenantName(),
                            tenancy.tenantPhone(),
                            room == null ? null : room.roomNumber(),
                            profile.getId(),
                            profile.getName(),
                            subscription.getStartedAt());
                })
                .filter(java.util.Objects::nonNull)
                .sorted(Comparator.comparing(
                        FoodSubscriberResponse::tenantName,
                        Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER)))
                .toList();
    }

    @Transactional
    public void endForTenancy(UUID tenancyId, String reason) {
        subscriptionRepository.findByTenancyIdAndActiveTrue(tenancyId)
                .ifPresent(subscription -> subscription.end(reason));
    }

    private TenancyResponse requireActiveAccountTenancy(UUID tenantUserId) {
        TenancyResponse tenancy = tenancyModule.findActiveByUserId(tenantUserId)
                .orElseThrow(() -> new ValidationException("Tenant has no active tenancy"));
        if (tenancy.guestStay() || tenancy.userId() == null) {
            throw new ValidationException("Guest stays cannot subscribe to food profiles");
        }
        return tenancy;
    }

    private void ensureFoodEnabled(UUID propertyId) {
        moduleSettingService.requireUsable(propertyId);
    }

    private FoodProfile requireProfileForProperty(UUID profileId, UUID propertyId) {
        FoodProfile profile = profileRepository.findByIdAndActiveTrue(profileId)
                .orElseThrow(() -> new NotFoundException("FoodProfile", profileId));
        if (!profile.getPropertyId().equals(propertyId)) {
            throw new ValidationException("Food profile is not available for this tenancy");
        }
        return profile;
    }
}
