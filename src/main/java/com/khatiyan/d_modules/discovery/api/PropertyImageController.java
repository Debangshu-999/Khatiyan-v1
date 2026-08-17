package com.khatiyan.d_modules.discovery.api;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.discovery.api.dto.AddPropertyImagesRequest;
import com.khatiyan.d_modules.discovery.api.dto.PropertyImageResponse;
import com.khatiyan.d_modules.discovery.service.PropertyImageService;

import jakarta.validation.Valid;

/**
 * The owner-facing gallery for a property's discovery listing.
 *
 * <p>Every mutation returns the full ordered gallery rather than just the row it
 * touched: removing or promoting an image renumbers the others, so a response
 * carrying one image would leave the client's copy wrong.
 */
@RestController
@RequestMapping("/api/v1/properties/{propertyId}/images")
@SuppressWarnings("null")
public class PropertyImageController {

    private final PropertyImageService propertyImageService;

    public PropertyImageController(PropertyImageService propertyImageService) {
        this.propertyImageService = propertyImageService;
    }

    @GetMapping
    public List<PropertyImageResponse> listImages(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return propertyImageService.listManagedImages(user.userId(), propertyId);
    }

    @PostMapping
    public List<PropertyImageResponse> addImages(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody AddPropertyImagesRequest request) {
        return propertyImageService.addImages(user.userId(), propertyId, request);
    }

    @DeleteMapping("/{imageId}")
    public List<PropertyImageResponse> removeImage(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID imageId) {
        return propertyImageService.removeImage(user.userId(), propertyId, imageId);
    }

    @PostMapping("/{imageId}/cover")
    public List<PropertyImageResponse> makeCover(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID imageId) {
        return propertyImageService.makeCover(user.userId(), propertyId, imageId);
    }
}
