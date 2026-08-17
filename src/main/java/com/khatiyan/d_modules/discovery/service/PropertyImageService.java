package com.khatiyan.d_modules.discovery.service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.discovery.api.dto.AddPropertyImagesRequest;
import com.khatiyan.d_modules.discovery.api.dto.PropertyImageResponse;
import com.khatiyan.d_modules.discovery.model.PropertyDiscoveryProfile;
import com.khatiyan.d_modules.discovery.model.PropertyImage;
import com.khatiyan.d_modules.discovery.repository.PropertyDiscoveryProfileRepository;
import com.khatiyan.d_modules.discovery.repository.PropertyImageRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * A property's discovery gallery.
 *
 * <p>Kept apart from {@link PropertyDiscoveryService}, which is already the
 * largest thing in this module and has nothing to say about image ordering.
 *
 * <p>Every mutation ends by rewriting the whole slot block for the property and
 * mirroring slot 0 onto the profile's cover column. Doing it in one place means
 * the gallery cannot drift out of order or out of step with the cover — the two
 * failure modes that a per-image "just set its index" approach invites.
 */
@Slf4j
@Service
public class PropertyImageService {

    private final PropertyImageRepository propertyImageRepository;
    private final PropertyDiscoveryProfileRepository discoveryProfileRepository;
    private final DiscoveryAccessPolicy discoveryAccessPolicy;

    public PropertyImageService(
            PropertyImageRepository propertyImageRepository,
            PropertyDiscoveryProfileRepository discoveryProfileRepository,
            DiscoveryAccessPolicy discoveryAccessPolicy) {
        this.propertyImageRepository = propertyImageRepository;
        this.discoveryProfileRepository = discoveryProfileRepository;
        this.discoveryAccessPolicy = discoveryAccessPolicy;
    }

    @Transactional(readOnly = true)
    public List<PropertyImageResponse> listManagedImages(UUID actorUserId, UUID propertyId) {
        discoveryAccessPolicy.ensureCanManageListing(actorUserId, propertyId);
        return propertyImageRepository.findByPropertyIdOrderBySortOrderAsc(propertyId).stream()
                .map(PropertyImageResponse::from)
                .toList();
    }

    @Transactional
    public List<PropertyImageResponse> addImages(UUID actorUserId, UUID propertyId, AddPropertyImagesRequest request) {
        discoveryAccessPolicy.ensureCanManageListing(actorUserId, propertyId);

        List<PropertyImage> existing = propertyImageRepository.findByPropertyIdOrderBySortOrderAsc(propertyId);
        if (existing.size() + request.images().size() > PropertyImage.MAX_PER_PROPERTY) {
            throw new ValidationException(
                    "A property can have at most " + PropertyImage.MAX_PER_PROPERTY + " images. "
                            + remainingText(PropertyImage.MAX_PER_PROPERTY - existing.size()));
        }

        int nextSlot = existing.size();
        List<PropertyImage> added = new ArrayList<>();
        for (AddPropertyImagesRequest.Image image : request.images()) {
            added.add(PropertyImage.of(propertyId, image.url(), image.publicId(), nextSlot++));
        }
        propertyImageRepository.saveAll(added);

        existing.addAll(added);
        syncCover(propertyId, existing);
        log.info("Property images added propertyId={} added={} total={}", propertyId, added.size(), existing.size());
        return toResponses(existing);
    }

    @Transactional
    public List<PropertyImageResponse> removeImage(UUID actorUserId, UUID propertyId, UUID imageId) {
        discoveryAccessPolicy.ensureCanManageListing(actorUserId, propertyId);

        PropertyImage image = propertyImageRepository.findByIdAndPropertyId(imageId, propertyId)
                .orElseThrow(() -> new NotFoundException("Property image", imageId));
        // A listing without a picture is a listing nobody opens. Registration
        // demands one, so removal has to hold the same line — otherwise the rule
        // only applies to owners who never edit.
        if (propertyImageRepository.countByPropertyId(propertyId) <= 1) {
            throw new ValidationException(
                    "A property needs at least one image. Add another before removing this one.");
        }
        propertyImageRepository.delete(image);

        // The Cloudinary asset is deliberately left in place; a separate sweep
        // reclaims orphans. Deleting it inline would make an image removal fail
        // whenever the storage call did.
        List<PropertyImage> remaining = new ArrayList<>(
                propertyImageRepository.findByPropertyIdOrderBySortOrderAsc(propertyId));
        remaining.removeIf(candidate -> candidate.getId().equals(imageId));
        resequence(remaining);
        syncCover(propertyId, remaining);
        log.info("Property image removed propertyId={} imageId={} remaining={}", propertyId, imageId, remaining.size());
        return toResponses(remaining);
    }

    @Transactional
    public List<PropertyImageResponse> makeCover(UUID actorUserId, UUID propertyId, UUID imageId) {
        discoveryAccessPolicy.ensureCanManageListing(actorUserId, propertyId);

        List<PropertyImage> images = new ArrayList<>(
                propertyImageRepository.findByPropertyIdOrderBySortOrderAsc(propertyId));
        PropertyImage promoted = images.stream()
                .filter(candidate -> candidate.getId().equals(imageId))
                .findFirst()
                .orElseThrow(() -> new NotFoundException("Property image", imageId));

        // Move to the front, keeping everything else in its existing relative
        // order. A straight swap with slot 0 would shuffle an unrelated image.
        images.remove(promoted);
        images.add(0, promoted);
        resequence(images);
        syncCover(propertyId, images);
        log.info("Property cover image set propertyId={} imageId={}", propertyId, imageId);
        return toResponses(images);
    }

    /**
     * Seeds the gallery from the images chosen during property registration.
     *
     * <p>No access check: the caller is the module listener reacting to a
     * property this user has just created, and there is no actor to check
     * against by the time the event is handled.
     */
    @Transactional
    public void createFromPropertyRegistration(UUID propertyId, List<AddPropertyImagesRequest.Image> images) {
        if (images == null || images.isEmpty()) {
            return;
        }
        // @ApplicationModuleListener delivers at least once. A redelivery would
        // otherwise insert the same gallery twice and collide on the unique
        // (property_id, sort_order) index, turning a duplicate into an error.
        if (propertyImageRepository.countByPropertyId(propertyId) > 0) {
            log.info("Property images already seeded, skipping redelivery propertyId={}", propertyId);
            return;
        }
        List<PropertyImage> rows = new ArrayList<>();
        int slot = 0;
        for (AddPropertyImagesRequest.Image image : images) {
            if (slot >= PropertyImage.MAX_PER_PROPERTY) {
                break;
            }
            rows.add(PropertyImage.of(propertyId, image.url(), image.publicId(), slot++));
        }
        propertyImageRepository.saveAll(rows);
        syncCover(propertyId, rows);
        log.info("Property images seeded at registration propertyId={} count={}", propertyId, rows.size());
    }

    /** Gallery URLs for one property, cover first. */
    @Transactional(readOnly = true)
    public List<String> imageUrlsFor(UUID propertyId) {
        return propertyImageRepository.findByPropertyIdOrderBySortOrderAsc(propertyId).stream()
                .map(PropertyImage::getUrl)
                .toList();
    }

    /**
     * Gallery URLs for many properties at once, keyed by property.
     *
     * <p>Search renders a page of cards that each want their images; this is the
     * one query that serves all of them.
     */
    @Transactional(readOnly = true)
    public Map<UUID, List<String>> imageUrlsFor(Collection<UUID> propertyIds) {
        if (propertyIds == null || propertyIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, List<String>> byProperty = new LinkedHashMap<>();
        for (PropertyImage image : propertyImageRepository.findAllByPropertyIds(propertyIds)) {
            byProperty.computeIfAbsent(image.getPropertyId(), key -> new ArrayList<>()).add(image.getUrl());
        }
        return byProperty;
    }

    /** Renumbers slots to 0..n-1 in list order, so no gaps or duplicates survive. */
    private void resequence(List<PropertyImage> images) {
        for (int index = 0; index < images.size(); index++) {
            images.get(index).moveTo(index);
        }
        propertyImageRepository.saveAll(images);
    }

    private void syncCover(UUID propertyId, List<PropertyImage> ordered) {
        discoveryProfileRepository.findActiveByPropertyId(propertyId)
                .ifPresent(profile -> applyCover(profile, ordered));
    }

    private void applyCover(PropertyDiscoveryProfile profile, List<PropertyImage> ordered) {
        profile.syncCoverImage(ordered.isEmpty() ? null : ordered.get(0).getUrl());
    }

    private List<PropertyImageResponse> toResponses(List<PropertyImage> images) {
        return images.stream().map(PropertyImageResponse::from).toList();
    }

    private String remainingText(int remaining) {
        if (remaining <= 0) {
            return "This property is already full.";
        }
        return remaining == 1 ? "You can add 1 more." : "You can add " + remaining + " more.";
    }
}
