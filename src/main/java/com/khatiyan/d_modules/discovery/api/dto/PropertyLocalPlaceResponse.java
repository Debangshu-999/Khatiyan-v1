package com.khatiyan.d_modules.discovery.api.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.discovery.model.PropertyLocalPlace;

public record PropertyLocalPlaceResponse(
        UUID id,
        UUID propertyId,
        String name,
        List<UUID> subcategoryIds,
        List<String> subcategoryNames,
        String description,
        String phone,
        String addressText,
        BigDecimal latitude,
        BigDecimal longitude,
        Double distanceKm,
        String directionsUrl,
        String photoUrl,
        boolean ownerRecommended
) {

    public static PropertyLocalPlaceResponse from(
            PropertyLocalPlace place,
            List<UUID> subcategoryIds,
            List<String> subcategoryNames,
            Double distanceKm,
            String directionsUrl) {
        return new PropertyLocalPlaceResponse(
                place.getId(),
                place.getPropertyId(),
                place.getName(),
                subcategoryIds,
                subcategoryNames,
                place.getDescription(),
                place.getPhone(),
                place.getAddressText(),
                place.getLatitude(),
                place.getLongitude(),
                distanceKm,
                directionsUrl,
                place.getPhotoUrl(),
                place.isOwnerRecommended());
    }
}
