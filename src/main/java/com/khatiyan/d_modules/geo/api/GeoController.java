package com.khatiyan.d_modules.geo.api;

import java.util.List;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
import com.khatiyan.d_modules.geo.api.dto.ReverseGeocodeResponse;
import com.khatiyan.d_modules.geo.service.GeocodingService;

/**
 * Geocoding proxy for the map pickers and discovery search. Serves any
 * authenticated role — owners register properties, admins pin nearby places,
 * tenants search areas. Vendor keys, caching and rate limits all stay
 * server-side.
 */
@RestController
@RequestMapping("/api/v1/geo")
public class GeoController {

    private final GeocodingService geocodingService;

    public GeoController(GeocodingService geocodingService) {
        this.geocodingService = geocodingService;
    }

    @GetMapping("/search")
    public List<GeoSuggestionResponse> search(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam String q,
            @RequestParam(required = false) Double nearLat,
            @RequestParam(required = false) Double nearLng) {
        return geocodingService.search(user.userId(), q, nearLat, nearLng);
    }

    @GetMapping("/reverse")
    public ReverseGeocodeResponse reverse(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam double lat,
            @RequestParam double lng) {
        return geocodingService.reverse(user.userId(), lat, lng)
                .orElseThrow(() -> new NotFoundException("Address", lat + "," + lng));
    }
}
