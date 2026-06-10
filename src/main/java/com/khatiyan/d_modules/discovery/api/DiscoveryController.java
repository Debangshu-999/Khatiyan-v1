package com.khatiyan.d_modules.discovery.api;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.discovery.DiscoveryModule;
import com.khatiyan.d_modules.discovery.api.dto.LocationAreaResponse;
import com.khatiyan.d_modules.discovery.api.dto.LocationCityResponse;
import com.khatiyan.d_modules.discovery.api.dto.LocationSuggestionResponse;
import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryCardResponse;
import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryDetailResponse;
import com.khatiyan.d_modules.discovery.api.dto.PropertyLocalPlaceResponse;
import com.khatiyan.d_modules.discovery.model.PropertyLocalPlaceTag;
import com.khatiyan.d_modules.discovery.service.LocationCatalogService;

@RestController
@RequestMapping("/api/v1/discovery")
@SuppressWarnings("null")
public class DiscoveryController {

    private final DiscoveryModule discoveryModule;
    private final LocationCatalogService locationCatalogService;

    public DiscoveryController(DiscoveryModule discoveryModule, LocationCatalogService locationCatalogService) {
        this.discoveryModule = discoveryModule;
        this.locationCatalogService = locationCatalogService;
    }

    @GetMapping("/properties")
    public PageResponse<PropertyDiscoveryCardResponse> searchProperties(
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String city,
            @RequestParam(required = false) String countryCode,
            @RequestParam(required = false) String locality,
            @RequestParam(required = false) BigDecimal latitude,
            @RequestParam(required = false) BigDecimal longitude,
            @RequestParam(required = false) Double radiusKm,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return discoveryModule.searchVisibleProperties(state, city, countryCode, locality, latitude, longitude, radiusKm, page, size);
    }

    @GetMapping("/properties/{propertyId}")
    public PropertyDiscoveryDetailResponse getProperty(
            @PathVariable UUID propertyId,
            @RequestParam(required = false) BigDecimal latitude,
            @RequestParam(required = false) BigDecimal longitude) {
        return discoveryModule.getVisibleProperty(propertyId, latitude, longitude);
    }

    @GetMapping("/locations/suggest")
    public List<LocationSuggestionResponse> suggestLocations(@RequestParam String q) {
        return locationCatalogService.suggest(q);
    }

    @GetMapping("/locations/cities")
    public List<LocationCityResponse> listCities() {
        return locationCatalogService.listCities();
    }

    @GetMapping("/locations/areas")
    public List<LocationAreaResponse> listAreas(@RequestParam String city) {
        return locationCatalogService.listAreas(city);
    }

    @GetMapping("/local-place-tags")
    public List<PropertyLocalPlaceTag> listLocalPlaceTags() {
        return List.of(PropertyLocalPlaceTag.values());
    }

    @GetMapping("/me/local-places")
    public List<PropertyLocalPlaceResponse> listMyLocalPlaces(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam(required = false) BigDecimal latitude,
            @RequestParam(required = false) BigDecimal longitude) {
        return discoveryModule.listMyLocalPlaces(user.userId(), latitude, longitude);
    }
}
