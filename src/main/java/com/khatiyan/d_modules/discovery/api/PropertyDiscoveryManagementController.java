package com.khatiyan.d_modules.discovery.api;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryProfileResponse;
import com.khatiyan.d_modules.discovery.api.dto.UpdatePropertyDiscoveryProfileRequest;
import com.khatiyan.d_modules.discovery.service.PropertyDiscoveryService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/properties/{propertyId}/discovery-profile")
@SuppressWarnings("null")
public class PropertyDiscoveryManagementController {

    private final PropertyDiscoveryService propertyDiscoveryService;

    public PropertyDiscoveryManagementController(PropertyDiscoveryService propertyDiscoveryService) {
        this.propertyDiscoveryService = propertyDiscoveryService;
    }

    @GetMapping
    public PropertyDiscoveryProfileResponse getProfile(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return propertyDiscoveryService.getManagedProfile(user.userId(), propertyId);
    }

    @PatchMapping
    public PropertyDiscoveryProfileResponse updateProfile(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody UpdatePropertyDiscoveryProfileRequest request) {
        return propertyDiscoveryService.updateManagedProfile(user.userId(), propertyId, request);
    }

    @PostMapping("/publish")
    public PropertyDiscoveryProfileResponse publishProfile(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return propertyDiscoveryService.publishProfile(user.userId(), propertyId);
    }

    @PostMapping("/unpublish")
    public PropertyDiscoveryProfileResponse unpublishProfile(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return propertyDiscoveryService.unpublishProfile(user.userId(), propertyId);
    }

    @PostMapping("/repair")
    public PropertyDiscoveryProfileResponse repairProfile(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return propertyDiscoveryService.repairManagedProfile(user.userId(), propertyId);
    }
}
