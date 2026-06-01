package com.khatiyan.d_modules.discovery.api.dto;

import java.math.BigDecimal;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.d_modules.discovery.model.PropertyDiscoveryProfile;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.PropertyFacility;
import com.khatiyan.d_modules.property.model.PropertyType;

public record PropertyDiscoveryDetailResponse(
        UUID propertyId,
        UUID ownerId,
        String name,
        String headline,
        String description,
        String address,
        String city,
        String pincode,
        BigDecimal latitude,
        BigDecimal longitude,
        Double distanceKm,
        String directionsUrl,
        PropertyType type,
        Set<PropertyFacility> facilities,
        Set<String> customFacilities,
        long standardDepositPaise,
        Long dailyGuestAcRatePaise,
        Long dailyGuestNonAcRatePaise,
        String profileImageUrl,
        boolean showOwnerContact,
        boolean showManagerContact
) {

    public static PropertyDiscoveryDetailResponse from(
            PropertyResponse property,
            PropertyDiscoveryProfile profile,
            Double distanceKm,
            String directionsUrl) {
        return new PropertyDiscoveryDetailResponse(
                property.id(),
                property.ownerId(),
                property.name(),
                profile.getHeadline(),
                profile.getDescription(),
                property.address(),
                property.city(),
                property.pincode(),
                property.latitude(),
                property.longitude(),
                distanceKm,
                directionsUrl,
                property.type(),
                property.facilities(),
                property.customFacilities(),
                property.standardDepositPaise(),
                property.dailyGuestAcRatePaise(),
                property.dailyGuestNonAcRatePaise(),
                profile.getProfileImageUrl(),
                profile.isShowOwnerContact(),
                profile.isShowManagerContact());
    }
}
