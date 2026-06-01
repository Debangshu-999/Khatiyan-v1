package com.khatiyan.d_modules.discovery.api.dto;

import java.math.BigDecimal;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.d_modules.discovery.model.PropertyLocalPlace;
import com.khatiyan.d_modules.discovery.model.PropertyLocalPlaceTag;

public record PropertyLocalPlaceResponse(
        UUID id,
        UUID propertyId,
        String name,
        Set<PropertyLocalPlaceTag> tags,
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

    public static PropertyLocalPlaceResponse from(PropertyLocalPlace place, Double distanceKm, String directionsUrl) {
        return new PropertyLocalPlaceResponse(
                place.getId(),
                place.getPropertyId(),
                place.getName(),
                place.getTags(),
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
