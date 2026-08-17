package com.khatiyan.d_modules.discovery.api.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.d_modules.discovery.model.PropertyDiscoveryProfile;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.NoticePeriod;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyFacility;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.property.model.SharingType;

public record PropertyDiscoveryDetailResponse(
        UUID propertyId,
        UUID ownerId,
        String name,
        String headline,
        String description,
        String address,
        String area,
        String city,
        String state,
        String pincode,
        BigDecimal latitude,
        BigDecimal longitude,
        Double distanceKm,
        String directionsUrl,
        PropertyType type,
        PgFor pgFor,
        PreferredTenantType preferredFor,
        boolean foodIncluded,
        Set<MealType> includedMeals,
        boolean electricityIncluded,
        BathroomType bathroomType,
        Set<SharingType> availableSharingTypes,
        Set<PropertyFacility> facilities,
        Set<String> customFacilities,
        long standardDepositPaise,
        Long startingRoomRentPaise,
        /**
         * Exit and payment terms, shown before anyone commits.
         *
         * <p>A prospective tenant is choosing between properties partly on how
         * hard they are to leave. Hiding the notice period until after move-in
         * makes that unknowable at the only moment it could change their mind.
         */
        NoticePeriod noticePeriod,
        int rentGraceDays,
        boolean dailyRentingAvailable,
        Long dailyGuestAcRatePaise,
        Long dailyGuestNonAcRatePaise,
        String profileImageUrl,
        String ownerName,
        String ownerPhone,
        boolean showOwnerContact,
        boolean showManagerContact,
        /** The full gallery, cover first. {@code profileImageUrl} is the cover. */
        List<String> imageUrls
) {

    public static PropertyDiscoveryDetailResponse from(
            PropertyResponse property,
            PropertyDiscoveryProfile profile,
            Double distanceKm,
            String directionsUrl,
            Long startingRoomRentPaise,
            String ownerName,
            String ownerPhone,
            List<String> imageUrls) {
        return new PropertyDiscoveryDetailResponse(
                property.id(),
                property.ownerId(),
                property.name(),
                profile.getHeadline(),
                profile.getDescription(),
                property.address(),
                property.area(),
                property.city(),
                property.state(),
                property.pincode(),
                property.latitude(),
                property.longitude(),
                distanceKm,
                directionsUrl,
                property.type(),
                property.pgFor(),
                property.preferredFor(),
                property.foodIncluded(),
                property.includedMeals(),
                property.electricityIncluded(),
                property.bathroomType(),
                property.availableSharingTypes(),
                property.facilities(),
                property.customFacilities(),
                property.standardDepositPaise(),
                startingRoomRentPaise,
                property.noticePeriod(),
                property.rentGraceDays(),
                hasPositiveDailyRate(property.dailyGuestAcRatePaise())
                        || hasPositiveDailyRate(property.dailyGuestNonAcRatePaise()),
                property.dailyGuestAcRatePaise(),
                property.dailyGuestNonAcRatePaise(),
                profile.getProfileImageUrl(),
                ownerName,
                ownerPhone,
                profile.isShowOwnerContact(),
                profile.isShowManagerContact(),
                imageUrls == null ? List.of() : imageUrls);
    }

    private static boolean hasPositiveDailyRate(Long value) {
        return value != null && value > 0;
    }
}
