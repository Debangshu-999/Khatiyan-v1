package com.khatiyan.d_modules.discovery.api.dto;

import java.math.BigDecimal;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.d_modules.discovery.model.PropertyDiscoveryProfile;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.PropertyFacility;
import com.khatiyan.d_modules.property.model.PropertyType;

public record PropertyDiscoveryCardResponse(
        UUID propertyId,
        String name,
        String headline,
        String description,
        String address,
        String city,
        String state,
        String pincode,
        BigDecimal latitude,
        BigDecimal longitude,
        Double distanceKm,
        String directionsUrl,
        PropertyType type,
        Set<PropertyFacility> facilities,
        Set<String> customFacilities,
        long standardDepositPaise,
        Long startingRoomRentPaise,
        boolean dailyRentingAvailable,
        Long dailyGuestAcRatePaise,
        Long dailyGuestNonAcRatePaise,
        String profileImageUrl
) {

    public static PropertyDiscoveryCardResponse from(
            PropertyResponse property,
            PropertyDiscoveryProfile profile,
            Double distanceKm,
            String directionsUrl,
            Long startingRoomRentPaise) {
        return new PropertyDiscoveryCardResponse(
                property.id(),
                property.name(),
                profile.getHeadline(),
                profile.getDescription(),
                property.address(),
                property.city(),
                property.state(),
                property.pincode(),
                property.latitude(),
                property.longitude(),
                distanceKm,
                directionsUrl,
                property.type(),
                property.facilities(),
                property.customFacilities(),
                property.standardDepositPaise(),
                startingRoomRentPaise,
                hasPositiveDailyRate(property.dailyGuestAcRatePaise())
                        || hasPositiveDailyRate(property.dailyGuestNonAcRatePaise()),
                property.dailyGuestAcRatePaise(),
                property.dailyGuestNonAcRatePaise(),
                profile.getProfileImageUrl());
    }

    private static boolean hasPositiveDailyRate(Long value) {
        return value != null && value > 0;
    }
}
