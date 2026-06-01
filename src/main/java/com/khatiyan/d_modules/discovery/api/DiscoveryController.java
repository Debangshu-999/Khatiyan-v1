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
import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryCardResponse;
import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryDetailResponse;
import com.khatiyan.d_modules.discovery.api.dto.PropertyLocalPlaceResponse;
import com.khatiyan.d_modules.discovery.model.PropertyLocalPlaceTag;

@RestController
@RequestMapping("/api/v1/discovery")
@SuppressWarnings("null")
public class DiscoveryController {

    private final DiscoveryModule discoveryModule;

    public DiscoveryController(DiscoveryModule discoveryModule) {
        this.discoveryModule = discoveryModule;
    }

    @GetMapping("/properties")
    public PageResponse<PropertyDiscoveryCardResponse> searchProperties(
            @RequestParam(required = false) String city,
            @RequestParam(required = false) String locality,
            @RequestParam(required = false) BigDecimal latitude,
            @RequestParam(required = false) BigDecimal longitude,
            @RequestParam(required = false) Double radiusKm,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return discoveryModule.searchVisibleProperties(city, locality, latitude, longitude, radiusKm, page, size);
    }

    @GetMapping("/properties/{propertyId}")
    public PropertyDiscoveryDetailResponse getProperty(
            @PathVariable UUID propertyId,
            @RequestParam(required = false) BigDecimal latitude,
            @RequestParam(required = false) BigDecimal longitude) {
        return discoveryModule.getVisibleProperty(propertyId, latitude, longitude);
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
