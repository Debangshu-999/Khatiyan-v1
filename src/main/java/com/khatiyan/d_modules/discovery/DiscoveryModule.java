package com.khatiyan.d_modules.discovery;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.d_modules.discovery.api.dto.LocalPlaceCategoryResponse;
import com.khatiyan.d_modules.discovery.api.dto.NearbyPlacesResponse;
import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryCardResponse;
import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryDetailResponse;
import com.khatiyan.d_modules.discovery.api.dto.PropertyLocalPlaceResponse;
import com.khatiyan.d_modules.discovery.service.LocalPlaceTaxonomyService;
import com.khatiyan.d_modules.discovery.service.NearbyPlacesSearchService;
import com.khatiyan.d_modules.discovery.service.PropertyDiscoveryService;
import com.khatiyan.d_modules.discovery.service.PropertyLocalPlaceService;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.SharingType;

@Component
public class DiscoveryModule {

    private final PropertyDiscoveryService propertyDiscoveryService;
    private final PropertyLocalPlaceService propertyLocalPlaceService;
    private final NearbyPlacesSearchService nearbyPlacesSearchService;
    private final LocalPlaceTaxonomyService taxonomyService;

    public DiscoveryModule(
            PropertyDiscoveryService propertyDiscoveryService,
            PropertyLocalPlaceService propertyLocalPlaceService,
            NearbyPlacesSearchService nearbyPlacesSearchService,
            LocalPlaceTaxonomyService taxonomyService) {
        this.propertyDiscoveryService = propertyDiscoveryService;
        this.propertyLocalPlaceService = propertyLocalPlaceService;
        this.nearbyPlacesSearchService = nearbyPlacesSearchService;
        this.taxonomyService = taxonomyService;
    }

    public PageResponse<PropertyDiscoveryCardResponse> searchVisibleProperties(
            String state,
            String city,
            String countryCode,
            String locality,
            BigDecimal latitude,
            BigDecimal longitude,
            Double radiusKm,
            PgFor pgFor,
            Long minRentPaise,
            Long maxRentPaise,
            PreferredTenantType preferredFor,
            Boolean foodIncluded,
            List<MealType> mealTypes,
            Boolean electricityIncluded,
            BathroomType bathroomType,
            List<SharingType> sharingTypes,
            int page,
            int size) {
        return propertyDiscoveryService.searchVisibleProperties(
                state,
                city,
                countryCode,
                locality,
                latitude,
                longitude,
                radiusKm,
                pgFor,
                minRentPaise,
                maxRentPaise,
                preferredFor,
                foodIncluded,
                mealTypes == null ? null : Set.copyOf(mealTypes),
                electricityIncluded,
                bathroomType,
                sharingTypes == null ? null : Set.copyOf(sharingTypes),
                page,
                size);
    }

    public PropertyDiscoveryDetailResponse getVisibleProperty(
            UUID propertyId,
            BigDecimal latitude,
            BigDecimal longitude) {
        return propertyDiscoveryService.getVisibleProperty(propertyId, latitude, longitude);
    }

    public void unlistPropertyProfileForDeactivation(UUID propertyId) {
        propertyDiscoveryService.unlistProfileForPropertyDeactivation(propertyId);
    }

    public List<PropertyLocalPlaceResponse> listMyLocalPlaces(
            UUID tenantUserId,
            BigDecimal latitude,
            BigDecimal longitude) {
        return propertyLocalPlaceService.listMyLocalPlaces(tenantUserId, latitude, longitude);
    }

    public NearbyPlacesResponse searchMyLocalPlaces(
            UUID tenantUserId,
            String query,
            BigDecimal latitude,
            BigDecimal longitude) {
        return nearbyPlacesSearchService.searchMine(tenantUserId, query, latitude, longitude);
    }

    public List<LocalPlaceCategoryResponse> listMyLocalPlaceTaxonomy(UUID tenantUserId) {
        return taxonomyService.listMyTaxonomy(tenantUserId);
    }
}
