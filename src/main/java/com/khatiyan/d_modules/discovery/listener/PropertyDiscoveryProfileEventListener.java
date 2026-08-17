package com.khatiyan.d_modules.discovery.listener;

import org.springframework.stereotype.Component;
import org.springframework.modulith.events.ApplicationModuleListener;

import com.khatiyan.d_modules.discovery.service.PropertyDiscoveryService;
import java.util.List;

import com.khatiyan.d_modules.discovery.api.dto.AddPropertyImagesRequest;
import com.khatiyan.d_modules.discovery.service.PropertyImageService;
import com.khatiyan.d_modules.property.event.PropertyCreatedEvent;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class PropertyDiscoveryProfileEventListener {

    private final PropertyDiscoveryService propertyDiscoveryService;
    private final PropertyImageService propertyImageService;

    public PropertyDiscoveryProfileEventListener(
            PropertyDiscoveryService propertyDiscoveryService,
            PropertyImageService propertyImageService) {
        this.propertyDiscoveryService = propertyDiscoveryService;
        this.propertyImageService = propertyImageService;
    }

    @ApplicationModuleListener
    public void createDraftDiscoveryProfile(PropertyCreatedEvent event) {
        try {
            propertyDiscoveryService.createDraftProfileAfterPropertyCreation(
                    event.propertyId(),
                    event.discoveryHeadline(),
                    event.discoveryDescription(),
                    event.discoveryProfileImageUrl());
            // Seeded after the profile exists, because seeding mirrors the cover
            // back onto it. The listener is at-least-once, so a redelivery would
            // duplicate rows — createFromPropertyRegistration is a no-op once the
            // gallery is non-empty for exactly that reason.
            propertyImageService.createFromPropertyRegistration(
                    event.propertyId(),
                    toImages(event.discoveryImages()));
            log.info("Draft discovery profile created after property commit propertyId={} ownerId={}",
                    event.propertyId(),
                    event.ownerId());
        } catch (RuntimeException exception) {
            log.error("Draft discovery profile creation failed after property commit propertyId={} ownerId={}",
                    event.propertyId(),
                    event.ownerId(),
                    exception);
        }
    }

    private List<AddPropertyImagesRequest.Image> toImages(List<PropertyCreatedEvent.ImageRef> refs) {
        if (refs == null || refs.isEmpty()) {
            return List.of();
        }
        return refs.stream()
                .map(ref -> new AddPropertyImagesRequest.Image(ref.url(), ref.publicId()))
                .toList();
    }
}
