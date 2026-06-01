package com.khatiyan.d_modules.discovery.api;

import java.math.BigDecimal;
import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.discovery.api.dto.CreatePropertyLocalPlaceRequest;
import com.khatiyan.d_modules.discovery.api.dto.PropertyLocalPlaceResponse;
import com.khatiyan.d_modules.discovery.api.dto.UpdatePropertyLocalPlaceRequest;
import com.khatiyan.d_modules.discovery.service.PropertyLocalPlaceService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/properties/{propertyId}/local-places")
@SuppressWarnings("null")
public class PropertyLocalPlaceController {

    private final PropertyLocalPlaceService propertyLocalPlaceService;

    public PropertyLocalPlaceController(PropertyLocalPlaceService propertyLocalPlaceService) {
        this.propertyLocalPlaceService = propertyLocalPlaceService;
    }

    @GetMapping
    public List<PropertyLocalPlaceResponse> listLocalPlaces(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) BigDecimal latitude,
            @RequestParam(required = false) BigDecimal longitude) {
        return propertyLocalPlaceService.listManagedLocalPlaces(user.userId(), propertyId, latitude, longitude);
    }

    @PostMapping
    public ResponseEntity<PropertyLocalPlaceResponse> createLocalPlace(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody CreatePropertyLocalPlaceRequest request) {
        PropertyLocalPlaceResponse response = propertyLocalPlaceService.createLocalPlace(
                user.userId(),
                propertyId,
                request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/properties/" + propertyId + "/local-places/" + response.id()))
                .body(response);
    }

    @PatchMapping("/{placeId}")
    public PropertyLocalPlaceResponse updateLocalPlace(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID placeId,
            @Valid @RequestBody UpdatePropertyLocalPlaceRequest request) {
        return propertyLocalPlaceService.updateLocalPlace(user.userId(), propertyId, placeId, request);
    }

    @DeleteMapping("/{placeId}")
    public ResponseEntity<Void> deleteLocalPlace(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID placeId) {
        propertyLocalPlaceService.deleteLocalPlace(user.userId(), propertyId, placeId);
        return ResponseEntity.noContent().build();
    }
}
