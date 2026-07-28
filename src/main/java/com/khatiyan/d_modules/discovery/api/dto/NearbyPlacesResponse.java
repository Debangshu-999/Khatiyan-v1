package com.khatiyan.d_modules.discovery.api.dto;

import java.util.List;

/**
 * Smart nearby-places search result: {@code direct} are places whose subcategory
 * matched the query; {@code related} are places in the same category as a match
 * but a different subcategory.
 */
public record NearbyPlacesResponse(
        List<PropertyLocalPlaceResponse> direct,
        List<PropertyLocalPlaceResponse> related) {
}
